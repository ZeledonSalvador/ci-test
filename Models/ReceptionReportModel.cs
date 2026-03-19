using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;

namespace FrontendQuickpass.Models
{
  
    /// Paginacion del API
  
    public class ReceptionPagination
    {
        public int? Total { get; set; }
        public int? Page { get; set; }
        public int? Limit { get; set; }
        public int? TotalPages { get; set; }
    }

    
    /// Totales del reporte de recepciones
    public class ReceptionTotals
    {
        public decimal? PesoBrutoAlmapac { get; set; }
        public decimal? PesoTaraAlmapac { get; set; }
        public decimal? PesoNetoAlmapac { get; set; }

        /// Formatea el peso con separador de miles
        public string FormatPeso(decimal? peso)
        {
            if (!peso.HasValue) return "0";
            return peso.Value.ToString("N0", System.Globalization.CultureInfo.GetCultureInfo("es-ES"));
        }
    }

    /// Respuesta transformada para el frontend (con headers legibles y datos formateados)

    public class ReceptionReportResponse
    {
        public List<Dictionary<string, object?>> Rows { get; set; } = new();
        public ReceptionPagination? Pagination { get; set; }
        public ReceptionTotals? Totales { get; set; }
    }
    public static class ReceptionReportTransformer
    {        private static readonly Dictionary<string, string> HeaderNames = new(StringComparer.OrdinalIgnoreCase)
        {
            { "fecha y hora de prechequeo", "FECHA Y HORA<br>PRECHEQUEO" },
            { "fecha y hora de entrada planta", "FECHA Y HORA<br>ENTRADA PLANTA" },
            { "fecha y hora de pesaje final", "FECHA Y HORA<br>PESAJE FINAL" },
            { "tiempo de atención (hh:mm)", "ATENCIÓN<br>(HH:MM)" },
            { "tiempo de descarga", "DESCARGA<br>(DD:HH:MM)" },
            { "número de transacción quickpass", "No.Transacción" },
            { "nombre pesador", "Pesador" },
            { "nombre del producto", "Producto" },
            { "nombre del cliente", "Cliente" },
            { "nombre del transportista", "Transportista" },
            { "placa del remolque", "Placa Remolque" },
            { "placa del camión", "Placa Camión" },
            { "nombre del motorista", "Motorista" },
            { "peso bruto almapac", "PESO BRUTO<br>ALMAPAC (KG)" },
            { "peso tara almapac", "PESO TARA<br>ALMAPAC (KG)" },
            { "peso neto almapac", "PESO NETO<br>ALMAPAC (KG)" },
            { "peso bruto cliente", "PESO BRUTO<br>CLIENTE (KG)" },
            { "peso tara cliente", "PESO TARA<br>CLIENTE (KG)" },
            { "peso neto cliente", "PESO NETO<br>CLIENTE (KG)" },
            { "diferencia peso bruto", "DIFERENCIA<br>PESO BRUTO (KG)" },
            { "diferencia de peso tara", "DIFERENCIA<br>PESO TARA (KG)" },
            { "diferencia de peso neto", "DIFERENCIA<br>PESO NETO (KG)" },
            { "punto de almacenamiento", "Almacén" },
            { "marchamos asignados", "Marchamos" },
            { "humedad", "Humedad (%)" },
            { "temperatura", "Temperatura (°C)" }
        };

        
        /// Campos que contienen fechas y deben formatearse
        
        private static readonly HashSet<string> DateTimeFields = new(StringComparer.OrdinalIgnoreCase)
        {
            "fecha y hora de prechequeo",
            "fecha y hora de entrada planta",
            "fecha y hora de pesaje final"
        };

        /// Campos que pueden contener mensajes especiales

        private static readonly HashSet<string> SpecialMessageFields = new(StringComparer.OrdinalIgnoreCase)
        {
            "tiempo de atención (hh:mm)",
            "tiempo de descarga"
        };

        /// Campos que contienen pesos y deben formatearse con separador de miles
        private static readonly HashSet<string> WeightFields = new(StringComparer.OrdinalIgnoreCase)
        {
            "peso bruto almapac",
            "peso tara almapac",
            "peso neto almapac",
            "peso bruto cliente",
            "peso tara cliente",
            "peso neto cliente",
            "diferencia peso bruto",
            "diferencia de peso tara",
            "diferencia de peso neto"
        };

        /// Transforma el JSON crudo del API a formato listo para el frontend

        public static ReceptionReportResponse Transform(string jsonPayload)
        {
            var result = new ReceptionReportResponse();

            using var doc = JsonDocument.Parse(jsonPayload);
            var root = doc.RootElement;

            // Buscar el array de datos (puede ser "data", "rows" o "items")
            JsonElement dataArray = default;
            if (root.TryGetProperty("data", out var dataEl) && dataEl.ValueKind == JsonValueKind.Array)
                dataArray = dataEl;
            else if (root.TryGetProperty("rows", out var rowsEl) && rowsEl.ValueKind == JsonValueKind.Array)
                dataArray = rowsEl;
            else if (root.TryGetProperty("items", out var itemsEl) && itemsEl.ValueKind == JsonValueKind.Array)
                dataArray = itemsEl;

            // Extraer paginación si existe
            if (root.TryGetProperty("pagination", out var paginationEl))
            {
                result.Pagination = new ReceptionPagination
                {
                    Total = GetIntProperty(paginationEl, "total"),
                    Page = GetIntProperty(paginationEl, "page"),
                    Limit = GetIntProperty(paginationEl, "limit"),
                    TotalPages = GetIntProperty(paginationEl, "totalPages")
                };
            }

            // Extraer totales si existen (puede venir como "Totales" o "totales")
            JsonElement totalesEl = default;
            if (root.TryGetProperty("Totales", out var totEl1))
                totalesEl = totEl1;
            else if (root.TryGetProperty("totales", out var totEl2))
                totalesEl = totEl2;

            if (totalesEl.ValueKind == JsonValueKind.Object)
            {
                result.Totales = new ReceptionTotals
                {
                    PesoBrutoAlmapac = GetDecimalProperty(totalesEl, "pesoBrutoAlmapac"),
                    PesoTaraAlmapac = GetDecimalProperty(totalesEl, "pesoTaraAlmapac"),
                    PesoNetoAlmapac = GetDecimalProperty(totalesEl, "pesoNetoAlmapac")
                };
            }

            // Procesar cada fila
            if (dataArray.ValueKind == JsonValueKind.Array)
            {
                foreach (var rowEl in dataArray.EnumerateArray())
                {
                    var transformedRow = new Dictionary<string, object?>();

                    foreach (var prop in rowEl.EnumerateObject())
                    {
                        var originalKey = prop.Name;
                        var value = ExtractValue(prop.Value);

                        // Aplicar formateo según el tipo de campo
                        var formattedValue = FormatFieldValue(originalKey, value);

                        // Obtener header legible
                        var header = GetHeaderName(originalKey);
                        transformedRow[header] = formattedValue;
                    }

                    result.Rows.Add(transformedRow);
                }
            }

            return result;
        }

        /// Obtiene el header legible para un nombre de campo original
    
        public static string GetHeaderName(string originalName)
        {
            return HeaderNames.TryGetValue(originalName.Trim(), out var header)
                ? header
                : originalName;
        }

        /// Extrae el valor de un JsonElement como object

        private static object? ExtractValue(JsonElement element)
        {
            return element.ValueKind switch
            {
                JsonValueKind.String => element.GetString(),
                JsonValueKind.Number => element.TryGetInt64(out var l) ? l : element.GetDouble(),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null => null,
                _ => element.GetRawText()
            };
        }

        
        /// Obtiene una propiedad int de un JsonElement

        private static int? GetIntProperty(JsonElement element, string propertyName)
        {
            if (element.TryGetProperty(propertyName, out var prop) && prop.ValueKind == JsonValueKind.Number)
                return prop.GetInt32();
            return null;
        }

        /// Obtiene una propiedad decimal de un JsonElement
        private static decimal? GetDecimalProperty(JsonElement element, string propertyName)
        {
            if (element.TryGetProperty(propertyName, out var prop) && prop.ValueKind == JsonValueKind.Number)
                return prop.GetDecimal();
            return null;
        }

        
        /// Aplica el formateo correspondiente según el tipo de campo
        
        private static object? FormatFieldValue(string fieldName, object? value)
        {
            if (value == null)
                return null;

            var strValue = value.ToString();
            if (string.IsNullOrWhiteSpace(strValue))
                return value;

            // Formatear fechas
            if (DateTimeFields.Contains(fieldName))
                return FormatDateTime(strValue);

            // Formatear mensajes especiales
            if (SpecialMessageFields.Contains(fieldName))
                return FormatSpecialMessage(strValue);

            // Formatear humedad
            if (fieldName.Equals("humedad", StringComparison.OrdinalIgnoreCase))
                return FormatHumedad(strValue);

            // Formatear pesos con separador de miles
            if (WeightFields.Contains(fieldName))
                return FormatWeight(value);

            return value;
        }

        private static string? FormatDateTime(string? isoDate)
        {
            if (string.IsNullOrWhiteSpace(isoDate))
                return null;

            // Intentar parsear ISO datetime
            if (DateTime.TryParse(isoDate, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            {
                return date.ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
            }

            return isoDate;
        }

        private static string? FormatSpecialMessage(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return null;

            var upperVal = value.ToUpperInvariant();

            // Formatear mensajes especiales con salto de linea
            if (upperVal == "ERROR EN LA CAPTURA DE FECHAS")
                return "ERROR EN LA<br>CAPTURA DE FECHAS";

            if (upperVal == "NO SE LE TOMÓ TIEMPO")
                return "NO SE LE<br>TOMÓ TIEMPO";

            return value;
        }

        private static string? FormatHumedad(string? strValue)
        {
            if (string.IsNullOrWhiteSpace(strValue))
                return null;

            // Si ya tiene %, devolverlo tal cual
            if (strValue.Contains("%"))
                return strValue;

            // Agregar % si es un numero
            if (decimal.TryParse(strValue, NumberStyles.Any, CultureInfo.InvariantCulture, out _))
                return $"{strValue}%";

            return strValue;
        }

        /// Formatea un peso con separador de miles (coma)
        private static string? FormatWeight(object? value)
        {
            if (value == null)
                return null;

            // Si es un número, formatearlo con separador de miles
            if (value is long longVal)
                return longVal.ToString("#,##0", CultureInfo.InvariantCulture);

            if (value is double doubleVal)
                return doubleVal.ToString("#,##0", CultureInfo.InvariantCulture);

            if (value is decimal decVal)
                return decVal.ToString("#,##0", CultureInfo.InvariantCulture);

            // Intentar parsear como número
            var strValue = value.ToString();
            if (decimal.TryParse(strValue, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
                return parsed.ToString("#,##0", CultureInfo.InvariantCulture);

            return strValue;
        }
    }
}
