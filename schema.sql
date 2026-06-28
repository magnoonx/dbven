-- 1. Crear tabla principal de reportes
CREATE TABLE IF NOT EXISTS reportes (
    id UUID PRIMARY KEY,
    categoria VARCHAR(50) NOT NULL,
    nombre_lugar VARCHAR(255) NOT NULL,
    descripcion TEXT,
    latitud NUMERIC(10, 6) NOT NULL,
    longitud NUMERIC(10, 6) NOT NULL,
    reportado_en_cliente TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Crear tabla secundaria de inventarios vinculada por llave foránea
CREATE TABLE IF NOT EXISTS inventario_insumos (
    id SERIAL PRIMARY KEY,
    reporte_id UUID REFERENCES reportes(id) ON DELETE CASCADE,
    item_nombre VARCHAR(155) NOT NULL,
    cantidad INT NOT NULL CHECK (cantidad >= 0),
    unidad VARCHAR(50) NOT NULL
);

-- Índices recomendados para optimizar búsquedas por categoría y ubicación
CREATE INDEX IF NOT EXISTS idx_reportes_categoria ON reportes(categoria);