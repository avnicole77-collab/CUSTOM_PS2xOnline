namespace CUSTOM_PS2xOnline.Infrastructure.Services;

public sealed class ConfigurationBackupService
{
    public ConfigurationBackup CreateBackup(string fileName, string backupName)
    {
        return new ConfigurationBackup(fileName, backupName, DateTime.UtcNow, 0);
    }
}

public sealed record ConfigurationBackup(string FileName, string BackupName, DateTime CreatedAt, long SizeBytes);