using Microsoft.EntityFrameworkCore;

namespace CUSTOM_PS2xOnline.Infrastructure.Data;

public sealed class AppDbContext : DbContext
{
    public DbSet<AppSettingRecord> AppSettings => Set<AppSettingRecord>();

    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppSettingRecord>(entity =>
        {
            entity.HasKey(setting => setting.Key);
            entity.Property(setting => setting.Key).HasMaxLength(128);
            entity.Property(setting => setting.Value).IsRequired();
        });

        base.OnModelCreating(modelBuilder);
    }
}

public sealed class AppSettingRecord
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}
