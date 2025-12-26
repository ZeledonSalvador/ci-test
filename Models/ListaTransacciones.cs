using System;
using System.Collections.Generic;

namespace FrontendQuickpass.Models
{
    /// <summary>
    /// Modelo para representar una transacción en el sistema
    /// </summary>
    public class ListaTransacciones
    {
        public int Id { get; set; }
        public string FechaEntrada { get; set; } = string.Empty;
        public string Transaccion { get; set; } = string.Empty;
        public string Producto { get; set; } = string.Empty;
        public string Cliente { get; set; } = string.Empty;
        public string Tarjeta { get; set; } = string.Empty;
        public string Actividad { get; set; } = string.Empty;
        public string PesoEntrada { get; set; } = string.Empty;
        public string PesoSalida { get; set; } = string.Empty;
        public string Estado { get; set; } = string.Empty;
    }

    /// <summary>
    /// ViewModel para paginación de transacciones
    /// </summary>
    public class ListaTransaccionesPager
    {
        public int Page { get; set; } = 1;
        public int Size { get; set; } = 10;
        public long TotalItems { get; set; }
        public int TotalPages { get; set; }
    }

    /// <summary>
    /// Respuesta paginada de la API de transacciones
    /// </summary>
    public class TransaccionesApiResponse
    {
        public bool Success { get; set; }
        public List<ListaTransacciones>? Data { get; set; }
        public PaginationInfo? Pagination { get; set; }
    }

    /// <summary>
    /// Información de paginación
    /// </summary>
    public class PaginationInfo
    {
        public int CurrentPage { get; set; }
        public int PageSize { get; set; }
        public long TotalRecords { get; set; }
        public int TotalPages { get; set; }
    }

    /// <summary>
    /// Filtros para búsqueda de transacciones
    /// </summary>
    public class TransaccionesFilters
    {
        public string? Search { get; set; }
        public string? Actividad { get; set; }
        public string? Estado { get; set; }
        public string? Producto { get; set; }
        public string? FechaInicio { get; set; }
        public string? FechaFin { get; set; }
        public int Page { get; set; } = 1;
        public int Size { get; set; } = 10;
    }
}
