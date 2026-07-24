using CUSTOM_PS2xOnline.Infrastructure.Services;
using CUSTOM_PS2xOnline.Network.Services;
using CUSTOM_PS2xOnline.PCSX2.Services;
using FluentAssertions;

namespace CUSTOM_PS2xOnline.Tests;

public sealed class LauncherWorkflowTests : IDisposable
{
    private readonly string _directory = Path.Combine(
        Path.GetTempPath(),
        "CUSTOM_PS2xOnline.WorkflowTests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public void GameLibrary_ShouldFindSupportedImagesOnly()
    {
        Directory.CreateDirectory(Path.Combine(_directory, "nested"));
        File.WriteAllText(Path.Combine(_directory, "Game A.iso"), string.Empty);
        File.WriteAllText(Path.Combine(_directory, "nested", "Game B.chd"), string.Empty);
        File.WriteAllText(Path.Combine(_directory, "notes.txt"), string.Empty);

        var games = new GameLibraryService().Scan(_directory);

        games.Should().HaveCount(2);
        games.Select(game => game.Title).Should().Contain(["Game A", "Game B"]);
    }

    [Fact]
    public void RoomSession_ShouldCreateAndNormalizeSafeCode()
    {
        var service = new RoomSessionService();
        var created = service.CreateRoom();

        service.TryJoin(created.ToLowerInvariant(), out var joined).Should().BeTrue();
        joined.Should().Be(created);
    }

    [Theory]
    [InlineData("")]
    [InlineData("ABC")]
    [InlineData("ROOM01")]
    [InlineData("TOO-LONG-CODE")]
    public void RoomSession_ShouldRejectInvalidCode(string code)
    {
        new RoomSessionService().TryJoin(code, out _).Should().BeFalse();
    }

    [Fact]
    public void Pcsx2Launcher_ShouldReportMissingExecutableAsNotReady()
    {
        new Pcsx2LauncherService()
            .IsReady(Path.Combine(_directory, "pcsx2-qt.exe"))
            .Should()
            .BeFalse();
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, true);
        }
    }
}
