using CUSTOM_PS2xOnline.Core.Services;

namespace CUSTOM_PS2xOnline.Controllers;

public sealed class ControllerAssignmentService
{
    public List<ControllerAssignment> Assign(IEnumerable<string> devices, int playerCount)
    {
        var assignments = new List<ControllerAssignment>();
        var deviceList = devices?.ToList() ?? new List<string>();

        for (var i = 0; i < Math.Min(deviceList.Count, playerCount); i++)
        {
            assignments.Add(new ControllerAssignment(deviceList[i], i + 1));
        }

        return assignments;
    }
}

public sealed record ControllerAssignment(string DeviceName, int PlayerNumber);