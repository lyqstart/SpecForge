// Regression from the actual timed-out empty stdout. No profile/key/process creation.
using System;using System.IO;using System.Security.Cryptography;
internal static class CanaryOutputRegression {
    internal static int Main(string[] args) {
        if(args.Length!=1)return 64;byte[] raw=File.ReadAllBytes(args[0]);if(raw.Length!=0)return 65;
        if(LpacRegistryReadCanary.ReadReport(System.Text.Encoding.UTF8.GetString(raw))!=null)return 1;
        foreach(var value in new[]{"null\n","{broken-json}","{\"probe\":17}","{\"probe\":\"D21_R01_REGISTRY_CANARY\"}"})if(LpacRegistryReadCanary.ReadReport(value)!=null)return 2;
        Console.WriteLine("ACTUAL_EMPTY_OUTPUT_AND_MALFORMED_REPORTS_CLASSIFIED_INCONCLUSIVE;NO_OS_EXPERIMENT;EXIT=0");return 0;
    }
}
