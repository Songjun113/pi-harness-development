using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
// A scheduled-task supervisor must never leave an orphan Web process behind.
public sealed class PiWebProcessJob : IDisposable {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int type, IntPtr info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass, SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters {
    public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount;
  }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public BasicLimits BasicLimitInformation;
    public IoCounters IoInfo;
    public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct StartupInfo {
    public uint cb; public string reserved, desktop, title;
    public uint x,y,xSize,ySize,xCountChars,yCountChars,fillAttribute,flags;
    public ushort showWindow,reserved2; public IntPtr reservedPtr,stdInput,stdOutput,stdError;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint processId,threadId; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcess(string application, System.Text.StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref StartupInfo startup, out ProcessInfo process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
  IntPtr handle;
  public PiWebProcessJob() {
    handle=CreateJobObject(IntPtr.Zero,null);
    if(handle==IntPtr.Zero) throw new Win32Exception();
    var limits=new ExtendedLimits();
    limits.BasicLimitInformation.LimitFlags=0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    int size=Marshal.SizeOf(limits); var memory=Marshal.AllocHGlobal(size);
    try {
      Marshal.StructureToPtr(limits,memory,false);
      if(!SetInformationJobObject(handle,9,memory,(uint)size)) throw new Win32Exception();
    } catch { Dispose(); throw; }
    finally { Marshal.FreeHGlobal(memory); }
  }
  static string Quote(string value) {
    var result=new System.Text.StringBuilder("\""); int slashes=0;
    foreach(char c in value) {
      if(c=='\\') { slashes++; continue; }
      if(c=='"') { result.Append('\\',slashes*2+1).Append(c); slashes=0; continue; }
      result.Append('\\',slashes).Append(c); slashes=0;
    }
    return result.Append('\\',slashes*2).Append('"').ToString();
  }
  public Process Start(ProcessStartInfo info) {
    var command=new System.Text.StringBuilder(Quote(info.FileName));
    foreach(var argument in info.ArgumentList) command.Append(' ').Append(Quote(argument));
    var entries=new System.Collections.Generic.List<string>();
    foreach(var pair in info.Environment) entries.Add(pair.Key+"="+pair.Value);
    entries.Sort(StringComparer.OrdinalIgnoreCase);
    var environmentBlock=string.Join("\0",entries)+"\0\0";
    var block=Marshal.StringToHGlobalUni(environmentBlock);
    var startup=new StartupInfo();startup.cb=(uint)Marshal.SizeOf(startup);
    ProcessInfo pi=new ProcessInfo(); bool created=false;
    try {
      if(!CreateProcess(info.FileName,command,IntPtr.Zero,IntPtr.Zero,false,0x4|0x400,block,string.IsNullOrEmpty(info.WorkingDirectory)?null:info.WorkingDirectory,ref startup,out pi)) throw new Win32Exception();
      created=true;
      if(!AssignProcessToJobObject(handle,pi.process)) throw new Win32Exception();
      var process=Process.GetProcessById((int)pi.processId);
      // Open the managed process handle before resuming: otherwise a fast
      // exit can leave Process.ExitCode unavailable after native handles close.
      var managedHandle=process.Handle;
      if(ResumeThread(pi.thread)==uint.MaxValue) { process.Dispose(); throw new Win32Exception(); }
      return process;
    } catch { if(created) TerminateProcess(pi.process,1); throw; }
    finally {
      for(int offset=0;offset<(environmentBlock.Length+1)*2;offset++) Marshal.WriteByte(block,offset,0);
      Marshal.FreeHGlobal(block);
      if(pi.thread!=IntPtr.Zero) CloseHandle(pi.thread);
      if(pi.process!=IntPtr.Zero) CloseHandle(pi.process);
    }
  }
  public void Attach(Process process) {
    if(!AssignProcessToJobObject(handle,process.Handle)) throw new Win32Exception();
  }
  public void Dispose() { if(handle!=IntPtr.Zero) { CloseHandle(handle); handle=IntPtr.Zero; } }
}
