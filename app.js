/* =========================================================================
   PWA Inspección Visual — app.js
   100% JavaScript Vanilla.
   Asincronía SOLO con new Promise / .then() / .catch() / .finally().
   PROHIBIDO: async/await y librerías externas.
   ========================================================================= */

/* -------------------------------------------------------------------------
   1. REGISTRO DEL SERVICE WORKER (ruta relativa para GitHub Pages)
   ------------------------------------------------------------------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('./sw.js')
      .then(function (registro) {
        console.log('[SW] Service Worker registrado. Scope:', registro.scope);
      })
      .catch(function (error) {
        console.error('[SW] Error al registrar el Service Worker:', error);
      });
  });
}

/* -------------------------------------------------------------------------
   2. INSTALACIÓN NATIVA (beforeinstallprompt)
   ------------------------------------------------------------------------- */
let eventoInstalacionDiferido = null;
const btnInstalar = document.getElementById('btn-instalar');

window.addEventListener('beforeinstallprompt', function (event) {
  // Evita que el mini-banner automático aparezca antes de tiempo
  event.preventDefault();
  eventoInstalacionDiferido = event;

  // Muestra tu botón personalizado de instalación en la UI
  btnInstalar.hidden = false;
  console.log('[Instalación] Prompt diferido listo. Botón "Instalar App" visible.');
});

btnInstalar.addEventListener('click', function () {
  if (!eventoInstalacionDiferido) {
    console.warn('[Instalación] No hay prompt disponible (¿ya instalada?).');
    return;
  }

  btnInstalar.disabled = true;
  eventoInstalacionDiferido.prompt();

  eventoInstalacionDiferido.userChoice
    .then(function (resultado) {
      console.log('[Instalación] Elección del usuario:', resultado.outcome);
      if (resultado.outcome === 'accepted') {
        btnInstalar.hidden = true;
      }
      eventoInstalacionDiferido = null;
    })
    .catch(function (error) {
      console.error('[Instalación] Falló el prompt de instalación:', error);
    })
    .finally(function () {
      btnInstalar.disabled = false;
    });
});

window.addEventListener('appinstalled', function () {
  btnInstalar.hidden = true;
  eventoInstalacionDiferido = null;
  actualizarMensajeEstado('¡Aplicación instalada en la pantalla de inicio!');
});

/* -------------------------------------------------------------------------
   3. ESTADO GLOBAL DE CÁMARA
   ------------------------------------------------------------------------- */
let streamActual = null;
let modoCamaraActual = 'environment'; // 'environment' = trasera | 'user' = frontal
let usuarioQuiereCamara = false;      // recordar la intención del usuario

const visorVideo = document.getElementById('visor-camara');
const avisoPermiso = document.getElementById('aviso-permiso');

function actualizarMensajeEstado(texto) {
  document.getElementById('mensaje-estado').textContent = texto;
}

/* Fragmento C: liberar el hardware ANTES de pedir un stream nuevo */
function detenerCamaraActiva() {
  if (streamActual) {
    streamActual.getTracks().forEach(function (track) {
      track.stop();
    });
    streamActual = null;
  }
}

/* -------------------------------------------------------------------------
   4. ENCENDIDO DE CÁMARA (Fragmento D + respaldo de facingMode)
   ------------------------------------------------------------------------- */
function iniciarCamara(modo) {
  detenerCamaraActiva();

  // getUserMedia solo existe en contextos seguros (HTTPS)
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    actualizarMensajeEstado('Este navegador no admite acceso a cámara. Verifica que la página esté en HTTPS.');
    return new Promise(function (resolve) {
      resolve(false);
    });
  }

  const etiquetaModo = modo === 'environment' ? 'Trasera' : 'Frontal';
  const restricciones = {
    video: { facingMode: modo },
    audio: false
  };

  return navigator.mediaDevices
    .getUserMedia(restricciones)
    .then(function (stream) {
      streamActual = stream;
      visorVideo.srcObject = stream;
      actualizarMensajeEstado('Cámara activa (' + etiquetaModo + ')');
      return true;
    })
    .catch(function (error) {
      // Permiso bloqueado por el usuario (decisión irreversible desde JS)
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        actualizarMensajeEstado('Permiso denegado. Habilita el acceso a la cámara en los ajustes de tu navegador.');
        return false;
      }

      // El lente solicitado no existe (o facingMode no coincide en este equipo)
      if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
        actualizarMensajeEstado('Lente ' + etiquetaModo + ' no disponible. Probando con el sensor por defecto...');
        return navigator.mediaDevices
          .getUserMedia({ video: true, audio: false })
          .then(function (streamRespaldo) {
            streamActual = streamRespaldo;
            visorVideo.srcObject = streamRespaldo;
            actualizarMensajeEstado('Cámara activa (sensor por defecto del dispositivo)');
            return true;
          })
          .catch(function (errorRespaldo) {
            actualizarMensajeEstado('No se detectó el sensor de cámara solicitado en este dispositivo.');
            console.error('[Cámara] Falló también el respaldo:', errorRespaldo);
            return false;
          });
      }

      actualizarMensajeEstado('Error al acceder al hardware: ' + error.message);
      return false;
    });
}

/* -------------------------------------------------------------------------
   5. CONSENTIMIENTO PERSISTENTE POR DISPOSITIVO (localStorage)
   Si el usuario ya aceptó el aviso de privacidad una vez, se guarda un flag
   y el aviso NO se vuelve a mostrar en este dispositivo.
   Nota: es un flag de UI simple; solo lo consume hilo principal (app.js),
   por eso localStorage sí es suficiente aquí (no necesita leerlo sw.js).
   ------------------------------------------------------------------------- */
const CLAVE_CONSENTIMIENTO = 'pwa-camara-consentimiento-v1';

function hayConsentimiento() {
  try {
    return window.localStorage.getItem(CLAVE_CONSENTIMIENTO) === 'aceptado';
  } catch (error) {
    console.warn('[Consentimiento] localStorage no disponible:', error);
    return false;
  }
}

function guardarConsentimiento() {
  try {
    window.localStorage.setItem(CLAVE_CONSENTIMIENTO, 'aceptado');
  } catch (error) {
    console.warn('[Consentimiento] No se pudo guardar:', error);
  }
}

function olvidarConsentimiento() {
  try {
    window.localStorage.removeItem(CLAVE_CONSENTIMIENTO);
  } catch (error) {
    console.warn('[Consentimiento] No se pudo eliminar:', error);
  }
}

// Alterna entre "Solicitar Acceso" (primera vez) y "Encender Cámara" (ya aceptado)
function sincronizarBotonesConsentimiento() {
  const aceptado = hayConsentimiento();
  document.getElementById('btn-preparar-camara').hidden = aceptado;
  document.getElementById('btn-encender-camara').hidden = !aceptado;
  document.getElementById('btn-olvidar-consentimiento').hidden = !aceptado;
}

// Aplicar el estado guardado en cuanto carga la página
sincronizarBotonesConsentimiento();

/* -------------------------------------------------------------------------
   6. FLUJO DE PRE-PERMISO (Fragmento E — UX ética)
   ------------------------------------------------------------------------- */

// Paso 1: el usuario pide acceso -> solo mostramos el aviso explicativo
document.getElementById('btn-preparar-camara').addEventListener('click', function () {
  avisoPermiso.hidden = false;
});

// Paso 2: el usuario confirma conscientemente -> AHORA sí se pide el hardware
document.getElementById('btn-confirmar-permiso').addEventListener('click', function () {
  avisoPermiso.hidden = true;
  guardarConsentimiento();          // Una sola vez por dispositivo
  sincronizarBotonesConsentimiento();
  usuarioQuiereCamara = true;
  iniciarCamara(modoCamaraActual);
});

// Encendido directo: el aviso ya se aceptó antes en ESTE dispositivo,
// por lo que no se vuelve a mostrar ni se vuelve a preguntar
document.getElementById('btn-encender-camara').addEventListener('click', function () {
  usuarioQuiereCamara = true;
  iniciarCamara(modoCamaraActual);
});

// Borra el consentimiento guardado (para volver a demostrar el pre-permiso)
document.getElementById('btn-olvidar-consentimiento').addEventListener('click', function () {
  olvidarConsentimiento();
  sincronizarBotonesConsentimiento();
  actualizarMensajeEstado('Consentimiento reiniciado: se mostrará el aviso de privacidad de nuevo.');
});

// El usuario se arrepiente: nunca se llega a invocar getUserMedia
document.getElementById('btn-cancelar-permiso').addEventListener('click', function () {
  avisoPermiso.hidden = true;
  actualizarMensajeEstado('Solicitud cancelada: la cámara permanece apagada.');
});

/* -------------------------------------------------------------------------
   7. BOTONES DE HARDWARE (Desafío de Ensamblado 2)
   ------------------------------------------------------------------------- */

// Alternar lentes environment <-> user
document.getElementById('btn-alternar-camara').addEventListener('click', function () {
  if (!streamActual) {
    // Con la cámara apagada no disparamos el diálogo nativo "a ciegas":
    // primero mostramos el aviso explicativo (pre-permiso)
    avisoPermiso.hidden = false;
    return;
  }
  modoCamaraActual = modoCamaraActual === 'environment' ? 'user' : 'environment';
  iniciarCamara(modoCamaraActual);
});

// Apagar: liberar el sensor y limpiar el visor
document.getElementById('btn-apagar-camara').addEventListener('click', function () {
  usuarioQuiereCamara = false;
  detenerCamaraActiva();
  visorVideo.srcObject = null;
  actualizarMensajeEstado('Cámara apagada. El sensor ha sido liberado.');
});

/* -------------------------------------------------------------------------
   8. LIBERACIÓN AUTOMÁTICA DEL SENSOR AL SALIR / CAMBIAR DE PESTAÑA
   ------------------------------------------------------------------------- */
window.addEventListener('pagehide', function () {
  detenerCamaraActiva();
});

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') {
    // No dejar el LED de la cámara encendido en segundo plano
    detenerCamaraActiva();
    visorVideo.srcObject = null;
  } else if (document.visibilityState === 'visible' && usuarioQuiereCamara) {
    // El permiso ya fue concedido: se reenciende sin volver a mostrar el aviso
    iniciarCamara(modoCamaraActual);
  }
});
