import ExpoModulesCore
import Foundation

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
  }
}
