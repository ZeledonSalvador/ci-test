using Microsoft.EntityFrameworkCore;
using FrontendQuickpass.Models.Db;

namespace FrontendQuickpass.Data
{
    public class PiletasDbContext : DbContext
    {
        public DbSet<TimerState> TimerStates { get; set; }
        public DbSet<UnitDisplayOrder> UnitDisplayOrders { get; set; }
        
        public PiletasDbContext(DbContextOptions<PiletasDbContext> options) : base(options)
        {
        }
        
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Configuración de TimerState
            modelBuilder.Entity<TimerState>(entity =>
            {
                entity.HasKey(e => e.TimerId);
                
                entity.HasIndex(e => e.TimerId)
                      .IsUnique()
                      .HasDatabaseName("IX_TimerState_TimerId");
                
                entity.HasIndex(e => e.TipoTimer)
                      .HasDatabaseName("IX_TimerState_TipoTimer");
                      
                entity.HasIndex(e => e.CodeGen)
                      .HasDatabaseName("IX_TimerState_CodeGen");
                
                entity.HasIndex(e => new { e.TipoTimer, e.StartedAt })
                      .HasDatabaseName("IX_TimerState_TipoTimer_StartedAt");
                
                entity.Property(e => e.TimerId)
                      .IsRequired()
                      .HasMaxLength(100);
                
                entity.Property(e => e.CodeGen)
                      .HasMaxLength(50);
                
                entity.Property(e => e.TipoTimer)
                      .IsRequired()
                      .HasMaxLength(20);
                
                entity.Property(e => e.TipoUnidad)
                      .HasMaxLength(20);
                
                entity.Property(e => e.StartedAt)
                      .IsRequired();
                
                entity.Property(e => e.CreatedAt)
                      .IsRequired()
                      .HasDefaultValueSql("datetime('now')");
                
                entity.ToTable("TimerStates");
            });

            // Configuración de UnitDisplayOrder
            modelBuilder.Entity<UnitDisplayOrder>(entity =>
            {
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => e.ShipmentId)
                      .HasDatabaseName("IX_UnitDisplayOrder_ShipmentId");

                entity.HasIndex(e => new { e.TipoTimer, e.DisplayOrder })
                      .HasDatabaseName("IX_UnitDisplayOrder_TipoTimer_DisplayOrder");

                entity.HasIndex(e => new { e.TipoTimer, e.CurrentStatus, e.DisplayOrder })
                      .HasDatabaseName("IX_UnitDisplayOrder_TipoTimer_Status_Order");

                // NUEVO: Unicidad por ShipmentId + TipoTimer para evitar duplicados
                entity.HasIndex(e => new { e.ShipmentId, e.TipoTimer })
                      .IsUnique()
                      .HasDatabaseName("UX_UnitDisplayOrder_Shipment_Tipo");

                entity.Property(e => e.ShipmentId)
                      .IsRequired();

                entity.Property(e => e.CodeGen)
                      .HasMaxLength(50);

                entity.Property(e => e.TipoTimer)
                      .IsRequired()
                      .HasMaxLength(20);

                entity.Property(e => e.DisplayOrder)
                      .IsRequired();

                entity.Property(e => e.UpdatedAt)
                      .IsRequired();

                entity.Property(e => e.CreatedAt)
                      .IsRequired()
                      .HasDefaultValueSql("datetime('now')");

                entity.Property(e => e.CurrentStatus)
                      .IsRequired();

                entity.ToTable("UnitDisplayOrders");
            });
            
            base.OnModelCreating(modelBuilder);
        }
    }
}