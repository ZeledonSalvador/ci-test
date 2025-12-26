// Models/CorrelativoComprobanteModel.cs
using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace FrontendQuickpass.Models
{
    public class CorrelativoComprobanteItem
    {
        // id -> Id
        [JsonPropertyName("id")]
        public int Id { get; set; }

          // bascula -> texto que mostramos en la tabla
        [JsonPropertyName("bascula")]
        public string Bascula { get; set; } = string.Empty;


        // basculaId -> IdBascula
        [JsonPropertyName("basculaId")]
        public int IdBascula { get; set; }

    
        // inicio -> Inicio de correlativo
        [JsonPropertyName("inicio")]
        public int Inicio { get; set; }

        // fin -> Fin de correlativo
        [JsonPropertyName("fin")]
        public int Fin { get; set; }

        // total -> Total comprobantes del rango
        [JsonPropertyName("total")]
        public int Total { get; set; }

        // disponibles -> Disponibles
        [JsonPropertyName("disponibles")]
        public int Disponibles { get; set; }

        // asignados -> Asignados
        [JsonPropertyName("asignados")]
        public int Asignados { get; set; }

        // anulados -> Anulados
        [JsonPropertyName("anulados")]
        public int Anulados { get; set; }

        // numeroCaja -> N° de caja
        [JsonPropertyName("numeroCaja")]
        public int NumeroCaja { get; set; }

        // fechaCreacion -> Fecha de creación
        [JsonPropertyName("fechaCreacion")]
        public DateTime FechaCreacion { get; set; }

        [JsonPropertyName("estadoGeneracion")]
        public string? EstadoGeneracion { get; set; }

        [JsonPropertyName("isActive")]
        public bool IsActive { get; set; }

        [JsonPropertyName("canEdit")]
        public bool CanEdit { get; set; }

        [JsonPropertyName("canDisable")]
        public bool CanDisable { get; set; }
    }

    public class CorrelativoComprobanteListResponse
    {
        [JsonPropertyName("data")]
        public List<CorrelativoComprobanteItem> Data { get; set; } = new();

        [JsonPropertyName("pagination")]
        public PaginationInfoModel Pagination { get; set; } = new();

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    public class CorrelativoComprobanteViewModel
    {
        public List<CorrelativoComprobanteItem> Items { get; set; } = new();
        public string? Search { get; set; }
    }
}
