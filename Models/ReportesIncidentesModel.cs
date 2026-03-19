using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace FrontendQuickpass.Models
{
    public class ApiPaginatedResponse<T>
    {
        public List<T>? Data { get; set; }
        public int? Total { get; set; }
        public int? TotalPages { get; set; }
        public int? CurrentPage { get; set; }
    }

    public class Pager
    {
        public int Page { get; set; }
        public int Size { get; set; }
        public int TotalItems { get; set; }
        public int TotalPages { get; set; }
    }

    public class PendingReportDto
    {
        public int Id { get; set; }
        public DriverDto? Driver { get; set; }
        public DateTime? ReportDatetime { get; set; }
        public string? EventType { get; set; }
        public string? FaultType { get; set; }
        public string? EventLocation { get; set; }
        public string? Description { get; set; }
        public List<string>? EvidenceUrls { get; set; }
        public int StatusBlacklist { get; set; }
        public DateTime? CreatedAt { get; set; }
        public ShipmentDto? Shipment { get; set; }
        public List<BlacklistStatusHistory>? StatusHistory { get; set; }
        
        // Propiedades procesadas por el controlador
        public List<string>? ProcessedUrls { get; set; }
        public string? DriverPhotoUrl { get; set; }
        public List<string>? EvidenceUrlsProcessed { get; set; }
    }

    public class BlacklistStatusHistory
    {
        public int Id { get; set; }
        public int BlacklistId { get; set; }
        public int Status { get; set; }
        public string? StatusText { get; set; }
        public string? ChangedBy { get; set; }
        public DateTime ChangeDateTime { get; set; }
        public string? ChangeReason { get; set; }
    }

    public class DriverDto 
    { 
        public string? License { get; set; } 
        public string? Name { get; set; } 
    }

    public class ShipmentDto
    {
        public int Id { get; set; }
        public string? CodeGen { get; set; }
        public string? Product { get; set; }
        public string? Transporter { get; set; }
        public string? OperationType { get; set; }
        public int? CurrentStatus { get; set; }
        public ClientDto? Client { get; set; }
        public List<ShipmentAttachmentDto>? Attachments { get; set; }
    }

    public class ClientDto
    {
        public int Id { get; set; }
        public string? IngenioCode { get; set; }
        public string? IngenioNavCode { get; set; }
        public string? Name { get; set; }
    }

    public class ShipmentAttachmentDto
    {
        public int Id { get; set; }
        public int ShipmentId { get; set; }
        public string? FileUrl { get; set; } // puede venir data:base64 o /api/...
        public string? FileName { get; set; }
        public string? FileType { get; set; } // IMAGE / VIDEO ...
        public string? AttachmentType { get; set; }
    }

    public class ApplyPenaltyRequest
    {
        public string License { get; set; } = string.Empty;
        public int ReportId { get; set; }
        public string PenaltyType { get; set; } = string.Empty;
        public DateTime PenaltyStartDate { get; set; }
        public DateTime? PenaltyEndDate { get; set; }
        public string? Observation { get; set; }
        public string AppliedBy { get; set; } = string.Empty;
    }

    // Enum para tipos de penalidad
    public enum PenaltyType
    {
        NO_APLICADO,
        TEMPORAL,
        PERMANENTE,
        FINALIZADO
    }
}