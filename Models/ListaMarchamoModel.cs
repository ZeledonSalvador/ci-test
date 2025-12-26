// Models/ListaMarchamosModel.cs
using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace FrontendQuickpass.Models
{
    public class ListaMarchamoItem
    {
        // id del marchamo individual
        [JsonPropertyName("id")]
        public int Id { get; set; }

        // fechaRegistro -> FechaRegistro
        [JsonPropertyName("fechaRegistro")]
        public DateTime FechaRegistro { get; set; }

        // marchamo -> número de marchamo
        [JsonPropertyName("marchamo")]
        public int Marchamo { get; set; }

        // estado -> código de estado (AVAILABLE, ASSIGNED, VOIDED)
        [JsonPropertyName("estado")]
        public string EstadoCode { get; set; } = string.Empty;

        // noEnvio -> número de envío (puede ser GUID string, número, o null)
        [JsonPropertyName("noEnvio")]
        public string? NumeroEnvio { get; set; }

        // posicion -> posición dentro del rango (no se muestra, pero puede ser útil)
        [JsonPropertyName("posicion")]
        public int? Posicion { get; set; }

        // canVoid -> indica si se puede anular este marchamo
        [JsonPropertyName("canVoid")]
        public bool CanVoid { get; set; }

        // Propiedad calculada para la vista:
        // mapea los códigos de estado en inglés a texto en español
        [JsonIgnore]
        public string Estado
        {
            get
            {
                if (string.IsNullOrWhiteSpace(EstadoCode))
                {
                    return "Desconocido";
                }

                switch (EstadoCode.ToUpperInvariant())
                {
                    case "AVAILABLE":
                        return "Disponible";
                    case "ASSIGNED":
                        return "Asignado";
                    case "VOIDED":
                        return "Anulado";
                    default:
                        // Si viene otro estado no contemplado, mostramos tal cual
                        return EstadoCode;
                }
            }
        }
    }

    public class ListaMarchamosApiResponse
    {
        // Ojo: el listado viene en la propiedad "marchamos"
        [JsonPropertyName("marchamos")]
        public List<ListaMarchamoItem> Data { get; set; } = new();

        [JsonPropertyName("pagination")]
        public PaginationInfoModel Pagination { get; set; } = new();

        // El ejemplo que me diste no trae "message", pero lo dejamos
        // por si el backend lo usa en errores u otros casos
        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    public class ListaMarchamosViewModel
    {
        public List<ListaMarchamoItem> Items { get; set; } = new List<ListaMarchamoItem>();

        // Paginación propia de la pantalla de ListaMarchamos
        public int Page { get; set; }
        public int Size { get; set; }
        public string Search { get; set; } = string.Empty;

        // Id de la serie (correlativo padre)
        public int CorrelativoId { get; set; }
    }
}
