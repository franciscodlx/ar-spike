import ExpoModulesCore
import Foundation
import MWDATCamera
import MWDATCore
import UIKit
#if DEBUG
import MWDATMockDevice
#endif

/// Thin bridge over Meta Wearables DAT 1.1.0 for the spike.
/// Flow: register (Meta AI round-trip) -> connect (device session) -> startStream -> capturePhoto.
public final class MetaWearablesModule: Module {
  private lazy var controller = WearablesController { [weak self] state in
    self?.sendEvent("onStateChange", state)
  }

  public func definition() -> ModuleDefinition {
    Name("MetaWearables")
    Events("onStateChange")

    OnCreate {
      do {
        try Wearables.configure()
      } catch {
        NSLog("[MetaWearables] configure failed: \(error)")
      }
    }

    AsyncFunction("getState") { () async -> [String: Any] in
      await self.controller.snapshot()
    }

    AsyncFunction("observeState") { () async in
      await self.controller.observe()
    }

    AsyncFunction("register") { () async throws in
      try await self.controller.register()
    }

    AsyncFunction("handleUrl") { (url: String) async throws -> Bool in
      guard let parsed = URL(string: url) else { return false }
      return try await self.controller.handleUrl(parsed)
    }

    AsyncFunction("enableMock") { () async throws in
      try await self.controller.enableMock()
    }

    AsyncFunction("connect") { () async throws in
      try await self.controller.connect()
    }

    AsyncFunction("startStream") { () async throws in
      try await self.controller.startStream()
    }

    AsyncFunction("capturePhoto") { (maxSide: Int?) async throws -> [String: Any] in
      try await self.controller.capturePhoto(maxSide: maxSide ?? 1024)
    }

    AsyncFunction("stop") { () async in
      await self.controller.stop()
    }
  }
}

private func bridgeError(_ message: String) -> Exception {
  Exception(name: "MetaWearablesError", description: message)
}

@MainActor
private final class WearablesController {
  private let wearables = Wearables.shared
  private let emit: ([String: Any]) -> Void
  private var session: DeviceSession?
  private var camera: MWDATCamera.Camera?
  private var sessionState: DeviceSessionState = .idle
  private var streamState: StreamState = .stopped
  private var tokens: [any AnyListenerToken] = []
  private var streamTokens: [any AnyListenerToken] = []
  private var observing = false
  // One long-lived selector, like Meta's CameraAccess sample: it needs time to pick a device,
  // so a selector created right before createSession() reports noEligibleDevice.
  private lazy var deviceSelector = AutoDeviceSelector(wearables: wearables)
  private var hasActiveDevice = false
  private var pendingPhoto: (id: Int, cont: CheckedContinuation<PhotoData, Error>)?
  private var photoSeq = 0
  #if DEBUG
  private var mockGlasses: (any MockGlasses)?
  #endif

  nonisolated init(emit: @escaping ([String: Any]) -> Void) {
    self.emit = emit
  }

  func snapshot() -> [String: Any] {
    var mock = false
    #if DEBUG
    mock = mockGlasses != nil
    #endif
    return [
      "registration": wearables.registrationState.description,
      "devices": wearables.devices.count,
      "activeDevice": hasActiveDevice,
      "session": sessionState.description,
      "stream": describe(streamState),
      "mock": mock,
    ]
  }

  private func publish() { emit(snapshot()) }

  func observe() {
    guard !observing else { return publish() }
    observing = true
    Task { [weak self] in
      guard let stream = self?.wearables.registrationStateStream() else { return }
      for await _ in stream { self?.publish() }
    }
    Task { [weak self] in
      guard let stream = self?.wearables.devicesStream() else { return }
      for await _ in stream { self?.publish() }
    }
    Task { [weak self] in
      guard let stream = self?.deviceSelector.activeDeviceStream() else { return }
      for await id in stream {
        self?.hasActiveDevice = id != nil
        self?.publish()
      }
    }
    publish()
  }

  func register() async throws {
    if wearables.registrationState.description == "registered" { return publish() }
    do {
      try await wearables.startRegistration()
    } catch RegistrationError.alreadyRegistered {
      publish()
    } catch {
      throw bridgeError("Registro falló: \(error)")
    }
  }

  func handleUrl(_ url: URL) async throws -> Bool {
    let isDat = URLComponents(url: url, resolvingAgainstBaseURL: false)?
      .queryItems?.contains(where: { $0.name == "metaWearablesAction" }) == true
    guard isDat else { return false }
    do {
      let handled = try await wearables.handleUrl(url)
      publish()
      return handled
    } catch {
      throw bridgeError("handleUrl falló: \(error)")
    }
  }

  func enableMock() throws {
    #if DEBUG
    guard mockGlasses == nil else { return }
    MockDeviceKit.shared.enable()
    do {
      let glasses = try MockDeviceKit.shared.pairGlasses(model: .rayBanMeta)
      // Same sequence as the sample: power on, put on, unfold; feed = phone's back camera.
      glasses.powerOn()
      glasses.don()
      glasses.unfold()
      glasses.services.camera.setCameraFeed(cameraFacing: .back)
      mockGlasses = glasses
      publish()
    } catch {
      throw bridgeError("No se pudo emparejar el mock: \(error)")
    }
    #else
    throw bridgeError("MockDeviceKit solo está disponible en Debug")
    #endif
  }

  func connect() async throws {
    if session != nil, sessionState == .started { return }
    observe()
    do {
      try await waitFor(seconds: 15, label: "gafas disponibles") { [weak self] in self?.hasActiveDevice == true }
    } catch {
      throw bridgeError("No hay gafas disponibles: enciéndelas, desdóblalas, póntelas y verifica que estén conectadas en Meta AI")
    }
    let newSession: DeviceSession
    do {
      newSession = try wearables.createSession(deviceSelector: deviceSelector)
    } catch {
      throw bridgeError("No se pudo crear la sesión: \(error)")
    }
    session = newSession
    tokens.append(newSession.statePublisher.listen { [weak self] state in
      Task { @MainActor in
        self?.sessionState = state
        if state == .stopped { self?.session = nil }
        self?.publish()
      }
    })
    do {
      try newSession.start()
    } catch {
      session = nil
      throw bridgeError("No se pudo iniciar la sesión: \(error)")
    }
    try await waitFor(seconds: 20, label: "sesión") { [weak self] in self?.sessionState == .started }
  }

  func startStream() async throws {
    guard let session, sessionState == .started else { throw bridgeError("Primero conecta (connect)") }
    if camera != nil, streamState == .streaming { return }
    do {
      if try await wearables.checkPermissionStatus(.camera) != .granted {
        guard try await wearables.requestPermission(.camera) == .granted else {
          throw bridgeError("Permiso de cámara de las gafas denegado")
        }
      }
    } catch let e as Exception {
      throw e
    } catch {
      throw bridgeError("Permiso de cámara: \(error)")
    }

    let config = StreamConfiguration(videoCodec: .hvc1, resolution: .low, frameRate: 24)
    let newCamera: MWDATCamera.Camera?
    do {
      newCamera = try session.addCamera(config: config)
    } catch {
      throw bridgeError("addCamera falló: \(error)")
    }
    guard let newCamera else { throw bridgeError("addCamera devolvió nil") }
    camera = newCamera
    let stream = newCamera.stream
    streamTokens.append(stream.statePublisher.listen { [weak self] state in
      Task { @MainActor in
        self?.streamState = state
        if state == .stopped { self?.clearStream() }
        self?.publish()
      }
    })
    streamTokens.append(stream.photoDataPublisher.listen { [weak self] data in
      Task { @MainActor in self?.resolvePhoto(.success(data)) }
    })
    streamTokens.append(stream.errorPublisher.listen { [weak self] error in
      Task { @MainActor in
        self?.resolvePhoto(.failure(bridgeError("Error de stream: \(error)")))
        NSLog("[MetaWearables] stream error: \(error)")
      }
    })
    stream.start()
    try await waitFor(seconds: 20, label: "stream") { [weak self] in self?.streamState == .streaming }
  }

  func capturePhoto(maxSide: Int) async throws -> [String: Any] {
    guard let camera, streamState == .streaming else { throw bridgeError("El stream no está activo") }
    guard pendingPhoto == nil else { throw bridgeError("Ya hay una captura en curso") }

    let start = CFAbsoluteTimeGetCurrent()
    photoSeq += 1
    let id = photoSeq
    let photo: PhotoData = try await withCheckedThrowingContinuation { cont in
      pendingPhoto = (id, cont)
      if !camera.stream.capturePhoto(format: .jpeg) {
        resolvePhoto(.failure(bridgeError("capturePhoto devolvió false")))
      }
      Task { @MainActor [weak self] in
        try? await Task.sleep(for: .seconds(10))
        // Only time out THIS capture, not a later one started after it finished.
        guard self?.pendingPhoto?.id == id else { return }
        self?.resolvePhoto(.failure(bridgeError("Timeout: la foto no llegó en 10 s")))
      }
    }
    let latencyMs = Int((CFAbsoluteTimeGetCurrent() - start) * 1000)

    guard let image = UIImage(data: photo.data) else { throw bridgeError("No se pudo decodificar la foto") }
    let resized = downscale(image, maxSide: CGFloat(maxSide))
    guard let jpeg = resized.jpegData(compressionQuality: 0.7) else { throw bridgeError("No se pudo recodificar") }
    let file = FileManager.default.temporaryDirectory
      .appendingPathComponent("glasses-\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
    try jpeg.write(to: file)

    return [
      "uri": file.absoluteString,
      "width": Int(resized.size.width * resized.scale),
      "height": Int(resized.size.height * resized.scale),
      "originalWidth": Int(image.size.width * image.scale),
      "originalHeight": Int(image.size.height * image.scale),
      "originalBytes": photo.data.count,
      "bytes": jpeg.count,
      "latencyMs": latencyMs,
    ]
  }

  func stop() {
    camera?.stop()
    clearStream()
    session?.stop()
    publish()
  }

  // MARK: helpers

  private func resolvePhoto(_ result: Result<PhotoData, Error>) {
    guard let pending = pendingPhoto else { return }
    pendingPhoto = nil
    pending.cont.resume(with: result)
  }

  private func clearStream() {
    streamTokens.removeAll()
    camera = nil
    resolvePhoto(.failure(bridgeError("El stream se detuvo")))
  }

  private func waitFor(seconds: Double, label: String, _ done: @escaping @MainActor () -> Bool) async throws {
    let deadline = Date().addingTimeInterval(seconds)
    while !done() {
      if Date() > deadline { throw bridgeError("Timeout esperando \(label) (\(Int(seconds)) s)") }
      try await Task.sleep(for: .milliseconds(100))
    }
  }

  private func downscale(_ image: UIImage, maxSide: CGFloat) -> UIImage {
    let size = image.size
    let longest = max(size.width, size.height) * image.scale
    guard longest > maxSide else { return image }
    let ratio = maxSide / longest
    let target = CGSize(width: size.width * image.scale * ratio, height: size.height * image.scale * ratio)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: target, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: target))
    }
  }

  private func describe(_ s: StreamState) -> String {
    switch s {
    case .stopping: return "stopping"
    case .stopped: return "stopped"
    case .waitingForDevice: return "waitingForDevice"
    case .starting: return "starting"
    case .streaming: return "streaming"
    case .paused: return "paused"
    @unknown default: return "unknown"
    }
  }
}
