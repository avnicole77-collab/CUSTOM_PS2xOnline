using CUSTOM_PS2xOnline.Controllers;
using CUSTOM_PS2xOnline.Core.Services;
using CUSTOM_PS2xOnline.Infrastructure.Services;
using CUSTOM_PS2xOnline.Network.Services;
using CUSTOM_PS2xOnline.PCSX2.Services;
using FluentAssertions;

namespace CUSTOM_PS2xOnline.Tests;

public class CoreServiceTests
{
    [Fact]
    public void UsernameValidation_ShouldRejectInvalidUsername()
    {
        var result = UsernameValidator.Validate("a");

        result.IsSuccess.Should().BeFalse();
        result.ErrorCode.Should().Be("VAL-USER-001");
    }

    [Fact]
    public void PasswordHash_ShouldCreateDifferentHashEachTime()
    {
        var service = new PasswordHashService();

        var first = service.HashPassword("P@ssw0rd123");
        var second = service.HashPassword("P@ssw0rd123");

        first.Should().NotBe(second);
        service.VerifyPassword("P@ssw0rd123", first).Should().BeTrue();
    }

    [Fact]
    public void RoomCodeGenerator_ShouldProduceUniqueSafeCode()
    {
        var code = RoomCodeGenerator.Generate();

        code.Should().MatchRegex("^[A-HJ-NP-Z2-9]{6,8}$");
        code.Should().NotContainAny("O", "0", "I", "1");
    }

    [Fact]
    public void PinHash_ShouldBeStableAndVerifiable()
    {
        var service = new PinHashService();
        var hash = service.HashPin("1234");

        hash.Should().NotBe("1234");
        service.VerifyPin("1234", hash).Should().BeTrue();
    }

    [Fact]
    public void DuplicateDetection_ShouldFlagSameGamePath()
    {
        var detector = new GameDuplicateDetector();
        var games = new[]
        {
            new GameMetadata("Demo Game", "SLES-00001", "USA", "D:/Games/demo.iso"),
            new GameMetadata("Demo Game", "SLES-00001", "USA", "D:/Games/demo.iso")
        };

        detector.IsDuplicate(games[0], games[1]).Should().BeTrue();
    }

    [Fact]
    public void FilePathValidation_ShouldRejectTraversalPath()
    {
        var result = FilePathValidator.Validate("..\\..\\secret.iso");

        result.IsSuccess.Should().BeFalse();
        result.ErrorCode.Should().Be("VAL-FILE-001");
    }

    [Fact]
    public void Pcsx2PathValidation_ShouldAcceptExecutablePath()
    {
        var result = Pcsx2PathValidator.Validate("C:\\PS2\\pcsx2-qt.exe");

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public void ConfigurationBackup_ShouldCreateBackupEntry()
    {
        var service = new ConfigurationBackupService();
        var backup = service.CreateBackup("appsettings.json", "default");

        backup.Should().NotBeNull();
        backup.FileName.Should().Contain("appsettings.json");
        backup.BackupName.Should().Be("default");
    }

    [Fact]
    public void ControllerAssignment_ShouldAssignPlayerSlots()
    {
        var service = new ControllerAssignmentService();
        var assignment = service.Assign(new[] { "Pad1", "Pad2" }, 2);

        assignment.Should().HaveCount(2);
        assignment[0].PlayerNumber.Should().Be(1);
        assignment[1].PlayerNumber.Should().Be(2);
    }

    [Fact]
    public void NetworkQualityRating_ShouldReturnFairForLatency()
    {
        var service = new NetworkQualityRatingService();
        var quality = service.Rate(85, 35, 1.5m, 3.0m);

        quality.Should().Be("Fair");
    }
}

public sealed record GameMetadata(string Title, string Serial, string Region, string FilePath);