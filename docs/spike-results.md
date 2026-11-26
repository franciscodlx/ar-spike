# Resultados del spike

Dispositivo: iPhone 17 Pro (iOS 27.2.1). Stack: Expo SDK 58 · RN 0.88.1 (Fabric) · ViroReact 3.2.3.

## Día 1 — App base

- OK: development build firmado con el team Helm (Z2G8RSF85P) corre en el iPhone.

## Día 2 — AR: plano, ancla y gestos

- OK: detección de planos horizontales, ancla por toque, arrastre, pellizco y rotación.
- **Hallazgo:** `ViroARPlaneSelector` no se suscribe a los anclajes; la escena debe reenviar
  `onAnchorFound/Updated/Removed` (si no, no se dibuja ningún plano).
- **Crash (26-nov-2026, ~2 min de prueba):** `EXC_BAD_ACCESS` (puntero nulo) en
  `VROInputControllerAR::processDragging` (ViroKit, hilo principal, durante el render).
  Hipótesis: ARKit fusionó/reemplazó el plano y destruyó el nodo hijo mientras se arrastraba.
  Mitigación: el cubo ahora vive en coordenadas de mundo (punto del toque), fuera del plano.
  Pendiente: repetir la prueba de 5 min para confirmar que ya no ocurre.
- Métricas de 5 min: pendientes (la primera corrida se perdió por el crash; ahora hay
  checkpoints `SPIKE_PROGRESS` cada 30 s en los logs de Metro).
- Re-prueba tras el fix (26-nov-2026): sin crashes nuevos en el iPhone. La corrida de 5 min
  con métricas no quedó registrada en Metro (sin `SPIKE_PROGRESS`); repetirla para cerrar el criterio C.

## Día 3 — Tablero 8x8 con Skia + Reanimated

Benchmark `Auto 60 s` (juego automático, 64 piezas, swaps + cascadas), fps medidos en el hilo de UI
con `useFrameCallback`, ProMotion activado (`CADisableMinimumFrameDurationOnPhone`).

| Métrica | Valor |
| --- | --- |
| fps promedio | 116.2 |
| fps mínimo (por segundo) | 115 |
| fps p5 | 115 |
| Frames > 12.5 ms (perdidos a 120 Hz) | 0.1 % |
| Frames > 20.7 ms (perdidos a 60 Hz) | 0 % |
| Swaps / cascadas | 84 / 113 |

**Veredicto A (match-3): GO.** Supera con amplitud el criterio de 60 fps mínimo y se sostiene cerca
de 120 Hz con cascadas continuas. Aún no hay efectos de partículas: medirlos cuando se agreguen.

## Día 4 — Sample iOS de Meta (Wearables Device Access Toolkit)

- SDK `MetaWearablesDAT` 1.1.0 (developer preview, 20-nov-2026) vía SPM. Requisitos: Xcode 26.4+,
  iOS 17.2+, firmware Ray-Ban Meta V130, Meta AI V292.
- Sample `CameraAccess` (rama `main` de github.com/meta/meta-wearables-dat-ios, clonado en
  `~/Dev/apps/meta-wearables-dat-ios`) compilado con team Helm (Z2G8RSF85P) como
  `com.helmmxfarma.cameraaccess`, en Developer Mode (sin `META_APP_ID`/`CLIENT_TOKEN`). Instalado en el iPhone.
- Firma automática aceptó los entitlements `HotspotConfiguration` y `wifi-info`.
- OK (26-nov-2026): MockDeviceKit, registro vía Meta AI en Developer Mode, stream y foto con las
  Ray-Ban Meta reales. **Disponibilidad en México confirmada en la práctica** (la documentación no
  publica lista de países).
- Incidencia: en la primera corrida la app se quedó congelada y hubo que matarla desde la Mac; no dejó
  reporte de hang. En la segunda corrida todo funcionó. Vigilar si se repite.
- Latencia de la foto: no medida con precisión en el sample; se medirá desde JS en el día 5.

**Veredicto parcial D (gafas): GO** para la integración; falta medir latencia y estabilidad de 10 min.

## Día 5 — Módulo nativo `@spike/meta-wearables` (Expo Modules)

Módulo local Swift sobre DAT 1.1.0 con API JS: `register()`, `connect()`, `startStream()`,
`capturePhoto(maxSide)` (devuelve `file://` JPEG reducido + latencia medida en nativo), `stop()` y
evento `onStateChange` (registro, dispositivos, gafas activas, sesión, stream, mock).
Probado el 26-nov-2026 con las Ray-Ban Meta reales en el iPhone 17 Pro.

| Métrica | Valor |
| --- | --- |
| Fotos manuales | 21 · prom 460 ms · p95 685 ms |
| Prueba 10 min (1 foto c/30 s) | 20 fotos · prom 472 ms · p95 836 ms · máx 836 ms |
| Fallos de foto en 10 min | 0 |
| Cortes de stream en 10 min | 1 (recuperado por reconexión automática, sin pérdida de fotos) |

**Veredicto D (gafas): GO.** La foto llega en menos de 1 s (criterio: < 3 s) y la conexión se
sostuvo 10 min sin fallos. El corte de stream observado obliga a que la app de producción
reconecte de forma transparente, como hace el spike.

Hallazgos de integración (para el diseño definitivo):
- Los frameworks del SDK son dinámicos: `spm_dependency` los enlaza pero no los embebe (crash dyld
  al abrir). Se usan como `vendored_frameworks`; tras clonar, correr
  `packages/meta-wearables/scripts/fetch-sdk.sh`.
- Expo reserva `startObserving`/`stopObserving` en módulos con eventos; no usar esos nombres.
- `AutoDeviceSelector` debe vivir todo el ciclo de la app (como en el sample); creado justo antes de
  `createSession` da `noEligibleDevice`.
- `startRegistration()` falla con `alreadyRegistered` si ya hay registro: tratarlo como éxito.
- Los entitlements `HotspotConfiguration`/`wifi-info` exigen App ID explícito: compilar con
  `xcodebuild ... -allowProvisioningUpdates` (el perfil comodín de `expo run:ios` falla).
- Metro llegó a servir JS en caché obsoleto tras renombrar funciones nativas: usar `expo start --clear`.
