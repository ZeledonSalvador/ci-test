using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Rendering;

namespace FrontendQuickpass.Models
{
    public class CorrelativoMarchamoItem
    {
        // id -> Id
        [JsonPropertyName("id")]
        public int Id { get; set; }

        // basculaId -> IdBascula (numérico)
        [JsonPropertyName("basculaId")]
        public int IdBascula { get; set; }

        // bascula -> nombre de la báscula
        [JsonPropertyName("bascula")]
        public string BasculaNombre { get; set; } = string.Empty;

        // clienteCodigo -> IngenioCode (código del cliente)
        [JsonPropertyName("clienteCodigo")]
        public string IngenioCode { get; set; } = string.Empty;

        // Nombre legible de cliente
        [JsonPropertyName("clienteNombre")]
        public string Cliente { get; set; } = string.Empty;

        // productoCodigo -> ProductCode (código del producto)
        [JsonPropertyName("productoCodigo")]
        public string ProductCode { get; set; } = string.Empty;

        // Nombre legible de producto
        [JsonPropertyName("productoNombre")]
        public string Producto { get; set; } = string.Empty;

        // inicio -> Inicio del rango
        [JsonPropertyName("inicio")]
        public int MinSealNumber { get; set; }

        // fin -> Fin del rango
        [JsonPropertyName("fin")]
        public int MaxSealNumber { get; set; }

        // total -> Total de marchamos del rango
        [JsonPropertyName("total")]
        public int Total { get; set; }

        // asignados -> Usados
        [JsonPropertyName("asignados")]
        public int Usados { get; set; }

        // disponibles -> Disponibles
        [JsonPropertyName("disponibles")]
        public int Disponibles { get; set; }

        // anulados -> Anulados
        [JsonPropertyName("anulados")]
        public int Anulados { get; set; }

        // fechaCreacion -> Fecha de creación
        [JsonPropertyName("fechaCreacion")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("estadoGeneracion")]
        public string? EstadoGeneracion { get; set; }

        [JsonPropertyName("isActive")]
        public bool IsActive { get; set; }

        [JsonPropertyName("canEdit")]
        public bool CanEdit { get; set; }

        [JsonPropertyName("canDisable")]
        public bool CanDisable { get; set; }
    }

    public class CorrelativoMarchamoListResponse
    {
        [JsonPropertyName("data")]
        public List<CorrelativoMarchamoItem> Data { get; set; } = new();

        [JsonPropertyName("pagination")]
        public PaginationInfoModel Pagination { get; set; } = new();

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    public class CorrelativoMarchamoSaveRequest
    {
        public int? Id { get; set; }

        public int IdBascula { get; set; }

        public string MinSealNumber { get; set; } = string.Empty;

        public string MaxSealNumber { get; set; } = string.Empty;

        public string IngenioCode { get; set; } = string.Empty;

        public string ProductCode { get; set; } = string.Empty;
    }

    public class EnableSealRangeRequest
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
    }

    public class CorrelativoMarchamoViewModel
    {
        public List<CorrelativoMarchamoItem> Items { get; set; } = new();

        public IEnumerable<SelectListItem>? Basculas { get; set; }
        public IEnumerable<SelectListItem>? Ingenios { get; set; }
        public IEnumerable<SelectListItem>? Productos { get; set; }

        public string? Search { get; set; }
    }
}
