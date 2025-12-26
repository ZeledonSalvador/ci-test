// Models/PaginationInfoModel.cs
namespace FrontendQuickpass.Models
{
    public class PaginationInfoModel
    {
        public int CurrentPage { get; set; }
        public int PageSize { get; set; }
        public int TotalRecords { get; set; }
        public int TotalPages { get; set; }
    }
}
