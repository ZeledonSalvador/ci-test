using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace FrontendQuickpass.Models
{
    public class ListaComprobanteItem
    {
        // id -> Id interno del registro
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("fechaRegistro")]
        public DateTime FechaRegistro { get; set; }

        [JsonPropertyName("noComprobante")]
        public int NumeroComprobante { get; set; }

        // IMPORTANTE: noEnvio es string
        [JsonPropertyName("noEnvio")]
        public string NumeroEnvio { get; set; } = string.Empty;

        // estado -> código de estado en inglés (AVAILABLE, ASSIGNED, VOIDED)
        [JsonPropertyName("estado")]
        public string EstadoCode { get; set; } = string.Empty;

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

        [JsonPropertyName("cliente")]
        public string Cliente { get; set; } = string.Empty;

        [JsonPropertyName("productoNombre")]
        public string Producto { get; set; } = string.Empty;

        [JsonPropertyName("fechaImpresion")]
        public DateTime? FechaImpresion { get; set; }

        [JsonPropertyName("canVoid")]
        public bool CanVoid { get; set; }

        public DateTime? FechaEntrada { get; set; }
        public string HoraEntrada { get; set; } = string.Empty;
        public decimal PesoEntrada { get; set; }

        public DateTime? FechaSalida { get; set; }
        public string HoraSalida { get; set; } = string.Empty;
        public decimal PesoBruto { get; set; }
        public decimal PesoTara { get; set; }
        public decimal PesoNeto { get; set; }

        public string Transporte { get; set; } = string.Empty;
        public string Motorista { get; set; } = string.Empty;
        public string Placa { get; set; } = string.Empty;
        public string PlacaRemolque { get; set; } = string.Empty;
        public int TransaccionNavId { get; set; }
        public string Marchamo { get; set; } = string.Empty;
        public string Licencia { get; set; } = string.Empty;
        public string Marchamos { get; set; } = string.Empty;
        public decimal? PorcentajeHumedad { get; set; }


    }
    public class ListaComprobanteApiResponse
    {

        [JsonPropertyName("range")]
        public ListaComprobanteRange? Range { get; set; }

        [JsonPropertyName("comprobantes")]
        public List<ListaComprobanteItem> Comprobantes { get; set; } = new List<ListaComprobanteItem>();

        [JsonPropertyName("pagination")]
        public PaginationInfoModel Pagination { get; set; } = new PaginationInfoModel();
    }

    public class ListaComprobanteRange
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("bascula")]
        public string Bascula { get; set; } = string.Empty;

        [JsonPropertyName("numeroCaja")]
        public int NumeroCaja { get; set; }

        [JsonPropertyName("inicio")]
        public int Inicio { get; set; }

        [JsonPropertyName("fin")]
        public int Fin { get; set; }

        [JsonPropertyName("total")]
        public int Total { get; set; }

        [JsonPropertyName("disponibles")]
        public int Disponibles { get; set; }

        [JsonPropertyName("asignados")]
        public int Asignados { get; set; }

        [JsonPropertyName("anulados")]
        public int Anulados { get; set; }
    }

    public class ListaComprobanteViewModel
    {
        public List<ListaComprobanteItem> Items { get; set; } = new List<ListaComprobanteItem>();

        // Paginación de la pantalla
        public int Page { get; set; }
        public int Size { get; set; }
        public string Search { get; set; } = string.Empty;

        // Id del correlativo padre
        public int CorrelativoId { get; set; }
    }
}
