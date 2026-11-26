import ExpoModulesCore
import Foundation
import ObjectiveC
import QuartzCore
import UIKit

// ProcessInfo is thread-safe, so these can run synchronously on the JS thread.
public final class DeviceMetricsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeviceMetrics")

    Function("getThermalState") { () -> String in
      switch ProcessInfo.processInfo.thermalState {
      case .nominal: return "nominal"
      case .fair: return "fair"
      case .serious: return "serious"
      case .critical: return "critical"
      @unknown default: return "unknown"
      }
    }

    Function("isLowPowerMode") { () -> Bool in
      ProcessInfo.processInfo.isLowPowerModeEnabled
    }

    // ViroKit 3.2.3 caps its render CADisplayLink at 30 fps unless -[VRODeviceUtil isBionicA12]
    // is true, and that check only matches the four A12 iPhones (iPhone11,x). Every newer device
    // (e.g. iPhone 17 Pro) is throttled. This finds the live VROViewAR(s) and lifts the cap.
    // Returns how many views were patched (0 = AR view not mounted yet).
    AsyncFunction("unlockArFrameRate") { (fps: Int) -> Int in
      guard let viewClass = NSClassFromString("VROViewAR"),
            let ivar = class_getInstanceVariable(viewClass, "_displayLink") else { return -1 }
      var patched = 0
      let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      for window in scenes.flatMap(\.windows) {
        var stack: [UIView] = [window]
        while let view = stack.popLast() {
          if view.isKind(of: viewClass), let link = object_getIvar(view, ivar) as? CADisplayLink {
            let target = Float(fps)
            link.preferredFrameRateRange = CAFrameRateRange(minimum: min(30, target), maximum: target, preferred: target)
            patched += 1
          }
          stack.append(contentsOf: view.subviews)
        }
      }
      return patched
    }.runOnQueue(.main)
  }
}
