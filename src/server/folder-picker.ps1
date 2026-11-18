# Opens the Windows "Select folder" window and prints the folder the user chose.
# Run by src/server/folder-picker.ts (as an encoded command, so no execution policy applies).
#
# Input (environment variables):
#   KAIROS_PICK_TITLE   window title
#   KAIROS_PICK_START   folder to open first (optional)
#   KAIROS_PICK_CHECK   when set, only checks that the picker compiles, prints "ok" and exits
# Exit codes: 0 = folder printed on stdout, 1 = cancelled, 2 = error (message on stderr).

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

try {
  Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class KairosFolderPicker
{
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    private class FileOpenDialog { }

    // IFileDialog, in vtable order. Only some methods are called; the rest hold their slots.
    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint count, IntPtr filters);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem item);
        void SetFolder(IShellItem item);
        void GetFolder(out IShellItem item);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler(IntPtr bindContext, ref Guid handler, ref Guid iid, out IntPtr result);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint kind, out IntPtr name);
        void GetAttributes(uint mask, out uint attributes);
        void Compare(IShellItem other, uint hint, out int order);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        string path, IntPtr bindContext, ref Guid iid, out IShellItem item);

    private const uint FOS_PICKFOLDERS = 0x20;
    private const uint FOS_FORCEFILESYSTEM = 0x40;
    private const uint FOS_PATHMUSTEXIST = 0x800;
    private const uint SIGDN_FILESYSPATH = 0x80058000;
    private const int ERROR_CANCELLED = unchecked((int)0x800704C7);

    /// <summary>Returns the chosen folder, or null when the user cancels.</summary>
    public static string Pick(string title, string startFolder)
    {
        var dialog = (IFileDialog)new FileOpenDialog();
        uint options;
        dialog.GetOptions(out options);
        dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
        dialog.SetTitle(title);
        dialog.SetOkButtonLabel("Use this folder");

        if (!string.IsNullOrEmpty(startFolder))
        {
            try
            {
                var iid = typeof(IShellItem).GUID;
                IShellItem folder;
                SHCreateItemFromParsingName(startFolder, IntPtr.Zero, ref iid, out folder);
                dialog.SetFolder(folder);
            }
            catch (Exception)
            {
                // The folder is gone: let Windows pick where to start.
            }
        }

        // An invisible, always-on-top owner keeps the window in front of the browser.
        using (var owner = new Form())
        {
            owner.TopMost = true;
            owner.ShowInTaskbar = false;
            owner.FormBorderStyle = FormBorderStyle.None;
            owner.StartPosition = FormStartPosition.CenterScreen;
            owner.Size = new System.Drawing.Size(1, 1);
            owner.Opacity = 0;
            owner.Show();
            owner.Activate();

            int result = dialog.Show(owner.Handle);
            if (result == ERROR_CANCELLED) return null;
            Marshal.ThrowExceptionForHR(result);
        }

        IShellItem chosen;
        dialog.GetResult(out chosen);
        IntPtr name;
        chosen.GetDisplayName(SIGDN_FILESYSPATH, out name);
        try
        {
            return Marshal.PtrToStringUni(name);
        }
        finally
        {
            Marshal.FreeCoTaskMem(name);
        }
    }
}
"@

  if ($env:KAIROS_PICK_CHECK) {
    [Console]::Out.Write("ok")
    exit 0
  }

  $path = [KairosFolderPicker]::Pick($env:KAIROS_PICK_TITLE, $env:KAIROS_PICK_START)
  if ($null -eq $path) { exit 1 }
  [Console]::Out.Write($path)
  exit 0
}
catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 2
}
