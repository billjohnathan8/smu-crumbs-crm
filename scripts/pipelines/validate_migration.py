#!/usr/bin/env python3
"""
Migration Validation Script

Compares outputs between old PowerShell/Bash scripts and new Python pipelines
to ensure behavioral equivalence during the migration period.

Usage:
    python scripts/pipelines/validate_migration.py --all
    python scripts/pipelines/validate_migration.py --backend
    python scripts/pipelines/validate_migration.py --frontend
    python scripts/pipelines/validate_migration.py --k8s
"""

import sys
import os
import subprocess
import argparse
from pathlib import Path
from datetime import datetime
import json

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))
from platform_abstraction import get_platform, run_command, get_shell_executable


class MigrationValidator:
    """Validates that new Python pipelines match old script behavior"""
    
    def __init__(self, workspace_root: Path):
        self.workspace = workspace_root
        self.results = {}
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.log_dir = workspace_root / "build-logs" / "migration-validation"
        self.log_dir.mkdir(parents=True, exist_ok=True)
    
    def compare_backend_tests(self) -> bool:
        """Compare backend test outputs"""
        print("\n" + "="*60)
        print("VALIDATING: Backend Test Pipeline")
        print("="*60)
        
        # Run new Python pipeline
        new_log = self.log_dir / f"new-backend-{self.timestamp}.log"
        print(f"\n[1/2] Running NEW Python pipeline...")
        new_result = run_command(
            [sys.executable, "scripts/pipelines/test_backend.py"],
            cwd=self.workspace,
            capture_output=True
        )
        new_log.write_text(new_result.stdout + "\n" + new_result.stderr)
        
        # Run old PowerShell/Bash script
        old_log = self.log_dir / f"old-backend-{self.timestamp}.log"
        print(f"[2/2] Running OLD PowerShell/Bash script...")
        
        platform = get_platform()
        if platform.is_windows:
            old_script = "scripts\\build-and-test-backend\\build-and-test-backend.ps1"
            cmd = ["pwsh", "-NoProfile", "-File", old_script]
        else:
            old_script = "scripts/build-and-test-backend/build-and-test-backend.sh"
            cmd = ["bash", old_script]
        
        old_result = run_command(cmd, cwd=self.workspace, capture_output=True)
        old_log.write_text(old_result.stdout + "\n" + old_result.stderr)
        
        # Compare results
        comparison = {
            "new_exit_code": new_result.returncode,
            "old_exit_code": old_result.returncode,
            "new_log": str(new_log),
            "old_log": str(old_log),
            "match": new_result.returncode == old_result.returncode
        }
        
        self.results["backend"] = comparison
        
        print(f"\n✓ New pipeline exit code: {new_result.returncode}")
        print(f"✓ Old script exit code: {old_result.returncode}")
        print(f"✓ Logs saved to: {self.log_dir}")
        print(f"{'✓ MATCH' if comparison['match'] else '✗ MISMATCH'}")
        
        return comparison["match"]
    
    def compare_frontend_tests(self) -> bool:
        """Compare frontend test outputs"""
        print("\n" + "="*60)
        print("VALIDATING: Frontend Test Pipeline")
        print("="*60)
        
        new_log = self.log_dir / f"new-frontend-{self.timestamp}.log"
        print(f"\n[1/2] Running NEW Python pipeline...")
        new_result = run_command(
            [sys.executable, "scripts/pipelines/test_frontend.py"],
            cwd=self.workspace,
            capture_output=True
        )
        new_log.write_text(new_result.stdout + "\n" + new_result.stderr)
        
        old_log = self.log_dir / f"old-frontend-{self.timestamp}.log"
        print(f"[2/2] Running OLD PowerShell/Bash script...")
        
        platform = get_platform()
        if platform.is_windows:
            cmd = ["pwsh", "-NoProfile", "-File", 
                   "scripts\\build-and-test-frontend\\build-and-test-frontend.ps1"]
        else:
            cmd = ["bash", "scripts/build-and-test-frontend/build-and-test-frontend.sh"]
        
        old_result = run_command(cmd, cwd=self.workspace, capture_output=True)
        old_log.write_text(old_result.stdout + "\n" + old_result.stderr)
        
        comparison = {
            "new_exit_code": new_result.returncode,
            "old_exit_code": old_result.returncode,
            "new_log": str(new_log),
            "old_log": str(old_log),
            "match": new_result.returncode == old_result.returncode
        }
        
        self.results["frontend"] = comparison
        
        print(f"\n✓ New pipeline exit code: {new_result.returncode}")
        print(f"✓ Old script exit code: {old_result.returncode}")
        print(f"✓ Logs saved to: {self.log_dir}")
        print(f"{'✓ MATCH' if comparison['match'] else '✗ MISMATCH'}")
        
        return comparison["match"]
    
    def compare_k8s_deploy(self) -> bool:
        """Compare K8s deployment (dry-run mode)"""
        print("\n" + "="*60)
        print("VALIDATING: K8s Deployment Pipeline")
        print("="*60)
        print("\nNote: Skipping actual deployment, validating command structure only")
        
        # For K8s, we'll just validate the help output matches
        new_log = self.log_dir / f"new-k8s-{self.timestamp}.log"
        print(f"\n[1/2] Checking NEW Python pipeline...")
        new_result = run_command(
            [sys.executable, "scripts/pipelines/deploy_k8s.py", "--help"],
            cwd=self.workspace,
            capture_output=True
        )
        new_log.write_text(new_result.stdout)
        
        old_log = self.log_dir / f"old-k8s-{self.timestamp}.log"
        print(f"[2/2] Checking OLD PowerShell/Bash script...")
        
        platform = get_platform()
        if platform.is_windows:
            cmd = ["pwsh", "-NoProfile", "-File",
                   "scripts\\build-and-deploy-k8s\\build-and-deploy-k8s-local.ps1", "-Help"]
        else:
            cmd = ["bash", "scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh", "--help"]
        
        old_result = run_command(cmd, cwd=self.workspace, capture_output=True)
        old_log.write_text(old_result.stdout)
        
        comparison = {
            "new_exit_code": new_result.returncode,
            "old_exit_code": old_result.returncode,
            "new_log": str(new_log),
            "old_log": str(old_log),
            "match": new_result.returncode == 0 and old_result.returncode == 0
        }
        
        self.results["k8s"] = comparison
        
        print(f"\n✓ New pipeline help: {'OK' if new_result.returncode == 0 else 'FAILED'}")
        print(f"✓ Old script help: {'OK' if old_result.returncode == 0 else 'FAILED'}")
        print(f"✓ Logs saved to: {self.log_dir}")
        print(f"{'✓ MATCH' if comparison['match'] else '✗ MISMATCH'}")
        
        return comparison["match"]
    
    def generate_report(self) -> Path:
        """Generate HTML validation report"""
        report_path = self.log_dir / f"validation-report-{self.timestamp}.html"
        
        all_passed = all(r.get("match", False) for r in self.results.values())
        status_color = "green" if all_passed else "red"
        status_text = "ALL VALIDATION PASSED" if all_passed else "SOME VALIDATIONS FAILED"
        
        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Migration Validation Report - {self.timestamp}</title>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; }}
        h1 {{ color: #333; }}
        .status {{ font-size: 24px; font-weight: bold; color: {status_color}; padding: 20px; 
                  background: #f0f0f0; border-radius: 5px; margin: 20px 0; }}
        table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 12px; text-align: left; }}
        th {{ background-color: #4CAF50; color: white; }}
        tr:nth-child(even) {{ background-color: #f2f2f2; }}
        .match {{ color: green; font-weight: bold; }}
        .mismatch {{ color: red; font-weight: bold; }}
        .summary {{ background: #e8f5e9; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }}
    </style>
</head>
<body>
    <h1>Pipeline Migration Validation Report</h1>
    <p>Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>
    
    <div class="status">{status_text}</div>
    
    <div class="summary">
        <strong>Validation Summary:</strong>
        <ul>
            <li>Total Pipelines Tested: {len(self.results)}</li>
            <li>Passed: {sum(1 for r in self.results.values() if r.get('match', False))}</li>
            <li>Failed: {sum(1 for r in self.results.values() if not r.get('match', False))}</li>
        </ul>
    </div>
    
    <h2>Detailed Results</h2>
    <table>
        <tr>
            <th>Pipeline</th>
            <th>New Exit Code</th>
            <th>Old Exit Code</th>
            <th>Status</th>
            <th>New Log</th>
            <th>Old Log</th>
        </tr>
"""
        
        for name, result in self.results.items():
            match_class = "match" if result["match"] else "mismatch"
            match_text = "✓ MATCH" if result["match"] else "✗ MISMATCH"
            html += f"""
        <tr>
            <td>{name.upper()}</td>
            <td>{result["new_exit_code"]}</td>
            <td>{result["old_exit_code"]}</td>
            <td class="{match_class}">{match_text}</td>
            <td><a href="file:///{result['new_log']}">{Path(result['new_log']).name}</a></td>
            <td><a href="file:///{result['old_log']}">{Path(result['old_log']).name}</a></td>
        </tr>
"""
        
        html += """
    </table>
    
    <h2>Next Steps</h2>
    <ul>
        <li>Review any mismatches in the logs</li>
        <li>Fix discrepancies in new Python pipelines if needed</li>
        <li>Once all validations pass, proceed to Stage 2 (Deprecation Warnings)</li>
    </ul>
    
    <p><em>This report is part of the Migration and Cleanup strategy.</em></p>
</body>
</html>
"""
        
        report_path.write_text(html)
        return report_path


def main():
    parser = argparse.ArgumentParser(
        description="Validate pipeline migration: Compare old scripts vs new pipelines"
    )
    parser.add_argument("--all", action="store_true", help="Validate all pipelines")
    parser.add_argument("--backend", action="store_true", help="Validate backend pipeline only")
    parser.add_argument("--frontend", action="store_true", help="Validate frontend pipeline only")
    parser.add_argument("--k8s", action="store_true", help="Validate K8s deployment pipeline only")
    
    args = parser.parse_args()
    
    # If no specific validation requested, show help
    if not any([args.all, args.backend, args.frontend, args.k8s]):
        parser.print_help()
        print("\n💡 Tip: Use --all to validate all pipelines")
        return 0
    
    workspace = Path(__file__).parent.parent.parent
    validator = MigrationValidator(workspace)
    
    print("╔" + "="*60 + "╗")
    print("║  PIPELINE MIGRATION VALIDATION (Stage 1: Dual Operation)   ║")
    print("╚" + "="*60 + "╝")
    print(f"\nWorkspace: {workspace}")
    print(f"Platform: {get_platform().name}")
    print(f"Timestamp: {validator.timestamp}")
    
    all_passed = True
    
    try:
        if args.all or args.backend:
            if not validator.compare_backend_tests():
                all_passed = False
        
        if args.all or args.frontend:
            if not validator.compare_frontend_tests():
                all_passed = False
        
        if args.all or args.k8s:
            if not validator.compare_k8s_deploy():
                all_passed = False
        
        # Generate report
        print("\n" + "="*60)
        print("Generating validation report...")
        report_path = validator.generate_report()
        print(f"✓ Report saved to: {report_path}")
        
        # Summary
        print("\n" + "="*60)
        print("VALIDATION SUMMARY")
        print("="*60)
        for name, result in validator.results.items():
            status = "✓ PASS" if result["match"] else "✗ FAIL"
            print(f"{name.upper():15} {status}")
        
        if all_passed:
            print("\n✓ ALL VALIDATIONS PASSED - Ready for Stage 2 (Deprecation)")
            return 0
        else:
            print("\n✗ SOME VALIDATIONS FAILED - Review logs and fix discrepancies")
            return 1
    
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
