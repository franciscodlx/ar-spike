require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'MetaWearables'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.author         = ''
  s.homepage       = 'https://github.com/meta/meta-wearables-dat-ios'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '17.2' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Meta ships the toolkit as dynamic xcframeworks (Swift package only). spm_dependency links them
  # into this pod but never embeds them in the app (dyld: "Library not loaded @rpath/MWDATCamera").
  # Vendoring lets CocoaPods' "[CP] Embed Pods Frameworks" phase copy and sign them into spike.app.
  frameworks = %w[MWDATCore MWDATCamera MWDATMockDevice]
  missing = frameworks.reject { |f| File.directory?(File.join(__dir__, 'Frameworks', "#{f}.xcframework")) }
  unless missing.empty?
    raise "MetaWearables: faltan #{missing.join(', ')}. Ejecuta packages/meta-wearables/scripts/fetch-sdk.sh"
  end
  s.vendored_frameworks = frameworks.map { |f| "Frameworks/#{f}.xcframework" }

  s.source_files = "*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
