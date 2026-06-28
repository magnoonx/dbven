# 📍 Sistema de Contingencia Sismica - Panel de Control

¡Bienvenidos al equipo de desarrollo colaborativo! Este sistema está diseñado para mapear incidentes, refugios, centros de acopio y la disponibilidad de insumos en tiempo real ante contingencias.

---

## 🔒 Arquitectura de Seguridad y Despliegue
Para preservar la integridad y alta disponibilidad de la infraestructura en producción, se ha establecido la siguiente política estricta de seguridad:
1. **Aislamiento de Producción:** El acceso SSH y directo a las bases de datos del VPS corporativo está restringido únicamente al Administrador del Sistema.
2. **Entorno de Desarrollo Desacoplado:** Ningún desarrollador necesita conectarse al servidor real para añadir características, componentes o endpoints. Todo el flujo de construcción se realiza de manera 100% local.

---

## 🛠️ Guía de Inicialización Local (Quickstart)

Para comenzar a trabajar en tu máquina local, sigue estos pasos:

### 1. Clonar el proyecto e Instalar dependencias
Asegúrate de tener instalado **Node.js** (versión 18 o superior) y ejecuta en tu terminal:
```bash
npm install