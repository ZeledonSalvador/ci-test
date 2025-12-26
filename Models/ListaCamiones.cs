using System;
using System.Collections.Generic;

namespace FrontendQuickpass.Models
{
    // Clase raíz usada por la vista ListaCamiones
    public class ListaCamiones
    {
        public int? Id { get; set; }

        public string? Transporter { get; set; }
        public int? IdNavRecord { get; set; }
        public string? CodeGen { get; set; }

        // Fecha Ingreso (en backend es dateTimePrecheckeo)
        public DateTime? DateTimePrecheckeo { get; set; }

        public string? NameProduct { get; set; }  // "AZUCAR_CRUDO_GRANEL", "MELAZA", etc. (se limpia en la vista)

        // Root-level truckType (ej. "PIPA", "RASTRA", "VOLTEO")
        public string? TruckType { get; set; }

        // Estado actual (numérico) + fecha del estado actual (opcional)
        public int? CurrentStatus { get; set; }
        public DateTime? DateTimeCurrentStatus { get; set; }

        // Entidades anidadas
        public DriverLC? Driver { get; set; }
        public VehicleLC? Vehicle { get; set; }
        public IngenioLC? Ingenio { get; set; }

        // Para mostrar "Sello" y, si quieres, el historial de estados
        public List<ShipmentSealLC>? ShipmentSeals { get; set; }
        public List<StatusLC>? Statuses { get; set; }
    }

    public class DriverLC
    {
        public string? Name { get; set; }
        public string? License { get; set; }
    }

    public class VehicleLC
    {
        public string? Plate { get; set; }         // Placa Cabezal
        public string? TrailerPlate { get; set; }  // Placa Remolque (se muestra resaltada)
        public string? TruckType { get; set; }     // P/R/V (fallback si no viene el root-level truckType)
    }

    public class IngenioLC
    {
        public string? Name { get; set; }          // Cliente (se renderiza con espacios)
    }

    public class ShipmentSealLC
    {
        public string? SealCode { get; set; }
        public string? SealDescription { get; set; }
    }

    public class StatusLC
    {
        public int Id { get; set; }
        public string? Status { get; set; }
        public DateTime? CreatedAt { get; set; }
    }

    // ViewModel para paginación
    public class ListaCamionesPager
    {
        public int Page { get; set; } = 1;
        public int Size { get; set; } = 10;
        public long TotalItems { get; set; }
        public int TotalPages { get; set; }
        public string? QueryDuration { get; set; } // si el API lo expone por headers
    }

    public class ApiPaginatedResponse
    {
        public List<ListaCamiones>? Data { get; set; }
        public long? Total { get; set; }
        public int? TotalPages { get; set; }
        public int? CurrentPage { get; set; }
        public int? PageSize { get; set; }
    }

    public class ApiErrorResponse
    {
        public string Message { get; set; } = string.Empty;
        public string? ExistingReportId { get; set; }
        public string? ExistingReportDriver { get; set; }
        public string? ExistingReportStatus { get; set; }
        public string? ShipmentCode { get; set; }
        public List<string>? Errors { get; set; }
        public int? TotalFiles { get; set; }
        public int? ValidFiles { get; set; }
        public string? OriginalError { get; set; }
    }
}