using System;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace FrontendQuickpass.JsonConverters
{
    /// <summary>
    /// Convertidor JSON que acepta tanto string como número y lo convierte a string.
    /// Útil cuando diferentes ambientes devuelven el mismo campo con tipos diferentes.
    /// </summary>
    public class FlexibleStringConverter : JsonConverter<string>
    {
        public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.String:
                    return reader.GetString();

                case JsonTokenType.Number:
                    // Puede ser int, long, decimal, etc.
                    if (reader.TryGetInt32(out int intValue))
                        return intValue.ToString();
                    if (reader.TryGetInt64(out long longValue))
                        return longValue.ToString();
                    if (reader.TryGetDecimal(out decimal decimalValue))
                        return decimalValue.ToString();
                    if (reader.TryGetDouble(out double doubleValue))
                        return doubleValue.ToString();
                    // Si ninguno funciona, devolver string vacío
                    return string.Empty;

                case JsonTokenType.Null:
                    return string.Empty;

                case JsonTokenType.True:
                    return "true";

                case JsonTokenType.False:
                    return "false";

                default:
                    // Para cualquier otro tipo, devolver string vacío
                    return string.Empty;
            }
        }

        public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
        {
            writer.WriteStringValue(value);
        }
    }
}
