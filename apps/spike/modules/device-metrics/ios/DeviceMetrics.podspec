Pod::Spec.new do |s|
  s.name           = 'DeviceMetrics'
  s.version        = '0.1.0'
  s.summary        = 'Thermal state and power mode for the AR spike'
  s.description    = 'Exposes ProcessInfo.thermalState and low power mode to JS'
  s.author         = ''
  s.homepage       = 'https://example.invalid'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
