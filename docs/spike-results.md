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
