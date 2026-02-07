#!/usr/bin/env python3
"""
Generate an HTML summary report for Kubernetes probe checks and deployment diagnostics.

This script reads probe-failures.json (if it exists) and the main log file,
then produces a comprehensive HTML report showing:
- Overall deployment success/failure status
- Probe check results categorized by type
- Detailed failure diagnostics with timestamps
- Quick navigation to specific failures

Usage:
    python3 generate-probe-summary.py <build_log_file> <output_dir>
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any


def parse_log_for_probe_results(log_file: Path) -> Dict[str, Any]:
    """Parse the build log to extract probe check results."""
    results = {
        "rollout_checks": [],
        "probe_presence_checks": [],
        "incluster_health_checks": [],
        "overall_status": "UNKNOWN",
        "timestamp": None,
    }
    
    if not log_file.exists():
        return results
    
    try:
        with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # Extract timestamp from log file name or first line
        timestamp_match = re.search(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]', content)
        if timestamp_match:
            results["timestamp"] = timestamp_match.group(1)
        
        # Check overall status
        if "Probe-aware smoke checks passed" in content:
            results["overall_status"] = "PASSED"
        elif "PROBE SMOKE FAILED" in content:
            results["overall_status"] = "FAILED"
        
        # Parse rollout checks
        rollout_section = re.search(
            r'==> Rollout gating.*?(?:==>|\Z)',
            content,
            re.DOTALL
        )
        if rollout_section:
            rollout_text = rollout_section.group(0)
            # Find passed rollouts
            for match in re.finditer(r'  \+ (deployment|statefulset)/(\S+) rolled out', rollout_text):
                results["rollout_checks"].append({
                    "type": match.group(1),
                    "name": match.group(2),
                    "status": "PASSED"
                })
            # Find failed rollouts
            for match in re.finditer(r'  x (deployment|statefulset)/(\S+) rollout timed out or failed', rollout_text):
                results["rollout_checks"].append({
                    "type": match.group(1),
                    "name": match.group(2),
                    "status": "FAILED"
                })
        
        # Parse probe presence checks
        probe_presence_section = re.search(
            r'==> Probe presence assertions.*?(?:==>|\Z)',
            content,
            re.DOTALL
        )
        if probe_presence_section:
            probe_text = probe_presence_section.group(0)
            # Find passed probes
            for match in re.finditer(
                r'  \+ (Deployment|StatefulSet)/(\S+) container=(\S+): (\w+Probe) present',
                probe_text
            ):
                results["probe_presence_checks"].append({
                    "resource_type": match.group(1),
                    "resource_name": match.group(2),
                    "container": match.group(3),
                    "probe_type": match.group(4),
                    "status": "PASSED"
                })
            # Find missing probes
            for match in re.finditer(
                r'  x (Deployment|StatefulSet)/(\S+) container=(\S+): MISSING (\w+Probe)',
                probe_text
            ):
                results["probe_presence_checks"].append({
                    "resource_type": match.group(1),
                    "resource_name": match.group(2),
                    "container": match.group(3),
                    "probe_type": match.group(4),
                    "status": "FAILED"
                })
        
        # Parse in-cluster health checks
        incluster_section = re.search(
            r'==> In-cluster probe health checks.*?(?:==>|\Z)',
            content,
            re.DOTALL
        )
        if incluster_section:
            health_text = incluster_section.group(0)
            # Find passed HTTP checks
            for match in re.finditer(r'HTTP (\S+):(\d+)(\S*)\s+  PASS \(HTTP (\d+)\)', health_text):
                results["incluster_health_checks"].append({
                    "endpoint": f"{match.group(1)}:{match.group(2)}{match.group(3)}",
                    "status_code": match.group(4),
                    "status": "PASSED"
                })
            # Find failed HTTP checks
            for match in re.finditer(r'HTTP (\S+):(\d+)(\S*)\s+  FAIL \(HTTP (\d+)\)', health_text):
                results["incluster_health_checks"].append({
                    "endpoint": f"{match.group(1)}:{match.group(2)}{match.group(3)}",
                    "status_code": match.group(4),
                    "status": "FAILED"
                })
    
    except Exception as e:
        print(f"Warning: Error parsing log file: {e}", file=sys.stderr)
    
    return results


def load_failure_json(json_file: Path) -> Optional[Dict]:
    """Load the probe-failures.json file if it exists."""
    if not json_file.exists():
        return None
    
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: Error loading failure JSON: {e}", file=sys.stderr)
        return None


def generate_html_report(
    log_results: Dict[str, Any],
    failure_data: Optional[Dict],
    log_file_name: str,
    output_file: Path
) -> None:
    """Generate an HTML summary report."""
    
    status_color = {
        "PASSED": "#28a745",
        "FAILED": "#dc3545",
        "UNKNOWN": "#6c757d"
    }
    
    overall_status = log_results["overall_status"]
    timestamp = log_results.get("timestamp") or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Count statistics
    rollout_passed = sum(1 for c in log_results["rollout_checks"] if c["status"] == "PASSED")
    rollout_failed = sum(1 for c in log_results["rollout_checks"] if c["status"] == "FAILED")
    
    probe_presence_passed = sum(1 for c in log_results["probe_presence_checks"] if c["status"] == "PASSED")
    probe_presence_failed = sum(1 for c in log_results["probe_presence_checks"] if c["status"] == "FAILED")
    
    health_passed = sum(1 for c in log_results["incluster_health_checks"] if c["status"] == "PASSED")
    health_failed = sum(1 for c in log_results["incluster_health_checks"] if c["status"] == "FAILED")
    
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Probe Diagnostics Summary - {timestamp}</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
        }}
        .container {{
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }}
        .header h1 {{
            font-size: 2.5em;
            margin-bottom: 10px;
        }}
        .header .timestamp {{
            font-size: 1.1em;
            opacity: 0.9;
        }}
        .status-banner {{
            padding: 20px;
            text-align: center;
            font-size: 1.5em;
            font-weight: bold;
            color: white;
            background-color: {status_color[overall_status]};
        }}
        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
        }}
        .summary-card {{
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        .summary-card h3 {{
            color: #495057;
            margin-bottom: 15px;
            font-size: 1.1em;
        }}
        .stat {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
        }}
        .stat:last-child {{
            border-bottom: none;
        }}
        .stat-label {{
            color: #6c757d;
        }}
        .stat-value {{
            font-weight: bold;
            font-size: 1.2em;
        }}
        .stat-value.passed {{
            color: #28a745;
        }}
        .stat-value.failed {{
            color: #dc3545;
        }}
        .section {{
            padding: 30px;
        }}
        .section h2 {{
            color: #495057;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        thead {{
            background: #667eea;
            color: white;
        }}
        th, td {{
            padding: 12px 15px;
            text-align: left;
        }}
        tbody tr:nth-child(even) {{
            background: #f8f9fa;
        }}
        tbody tr:hover {{
            background: #e9ecef;
        }}
        .badge {{
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: bold;
        }}
        .badge.passed {{
            background: #d4edda;
            color: #155724;
        }}
        .badge.failed {{
            background: #f8d7da;
            color: #721c24;
        }}
        .failure-details {{
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
        }}
        .failure-details h4 {{
            color: #856404;
            margin-bottom: 10px;
        }}
        .failure-details pre {{
            background: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 0.9em;
        }}
        .footer {{
            padding: 20px;
            text-align: center;
            background: #f8f9fa;
            color: #6c757d;
            font-size: 0.9em;
        }}
        .log-link {{
            color: #667eea;
            text-decoration: none;
            font-weight: bold;
        }}
        .log-link:hover {{
            text-decoration: underline;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Probe Diagnostics Summary</h1>
            <div class="timestamp">Generated: {timestamp}</div>
        </div>
        
        <div class="status-banner">
            Overall Status: {overall_status}
        </div>
        
        <div class="summary-grid">
            <div class="summary-card">
                <h3>📊 Rollout Checks</h3>
                <div class="stat">
                    <span class="stat-label">Passed</span>
                    <span class="stat-value passed">{rollout_passed}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Failed</span>
                    <span class="stat-value failed">{rollout_failed}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Total</span>
                    <span class="stat-value">{rollout_passed + rollout_failed}</span>
                </div>
            </div>
            
            <div class="summary-card">
                <h3>🔬 Probe Presence</h3>
                <div class="stat">
                    <span class="stat-label">Passed</span>
                    <span class="stat-value passed">{probe_presence_passed}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Failed</span>
                    <span class="stat-value failed">{probe_presence_failed}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Total</span>
                    <span class="stat-value">{probe_presence_passed + probe_presence_failed}</span>
                </div>
            </div>
            
            <div class="summary-card">
                <h3>🌐 In-Cluster Health</h3>
                <div class="stat">
                    <span class="stat-label">Passed</span>
                    <span class="stat-value passed">{health_passed}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Failed</span>
                    <span class="stat-value failed">{health_failed}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Total</span>
                    <span class="stat-value">{health_passed + health_failed}</span>
                </div>
            </div>
        </div>
"""
    
    # Rollout checks section
    if log_results["rollout_checks"]:
        html_content += """
        <div class="section">
            <h2>📊 Rollout Checks</h2>
            <table>
                <thead>
                    <tr>
                        <th>Resource Type</th>
                        <th>Name</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
"""
        for check in log_results["rollout_checks"]:
            status_class = "passed" if check["status"] == "PASSED" else "failed"
            html_content += f"""
                    <tr>
                        <td>{check["type"]}</td>
                        <td>{check["name"]}</td>
                        <td><span class="badge {status_class}">{check["status"]}</span></td>
                    </tr>
"""
        html_content += """
                </tbody>
            </table>
        </div>
"""
    
    # Probe presence section
    if log_results["probe_presence_checks"]:
        html_content += """
        <div class="section">
            <h2>🔬 Probe Presence Checks</h2>
            <table>
                <thead>
                    <tr>
                        <th>Resource</th>
                        <th>Container</th>
                        <th>Probe Type</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
"""
        for check in log_results["probe_presence_checks"]:
            status_class = "passed" if check["status"] == "PASSED" else "failed"
            resource_full = f"{check['resource_type']}/{check['resource_name']}"
            html_content += f"""
                    <tr>
                        <td>{resource_full}</td>
                        <td>{check["container"]}</td>
                        <td>{check["probe_type"]}</td>
                        <td><span class="badge {status_class}">{check["status"]}</span></td>
                    </tr>
"""
        html_content += """
                </tbody>
            </table>
        </div>
"""
    
    # In-cluster health checks section
    if log_results["incluster_health_checks"]:
        html_content += """
        <div class="section">
            <h2>🌐 In-Cluster Health Checks</h2>
            <table>
                <thead>
                    <tr>
                        <th>Endpoint</th>
                        <th>HTTP Status Code</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
"""
        for check in log_results["incluster_health_checks"]:
            status_class = "passed" if check["status"] == "PASSED" else "failed"
            html_content += f"""
                    <tr>
                        <td>{check["endpoint"]}</td>
                        <td>{check["status_code"]}</td>
                        <td><span class="badge {status_class}">{check["status"]}</span></td>
                    </tr>
"""
        html_content += """
                </tbody>
            </table>
        </div>
"""
    
    # Detailed failures section (if failure data exists)
    if failure_data:
        html_content += """
        <div class="section">
            <h2>⚠️ Detailed Failure Diagnostics</h2>
"""
        
        if failure_data.get("Failures"):
            failures = failure_data["Failures"]
            
            if failures.get("Rollout"):
                html_content += """
            <h3>Rollout Failures</h3>
"""
                for failure in failures["Rollout"]:
                    html_content += f"""
            <div class="failure-details">
                <h4>{failure.get("Resource", "Unknown Resource")}</h4>
                <p><strong>Detail:</strong> {failure.get("Detail", "No details available")}</p>
                <p><strong>Timestamp:</strong> {failure.get("Timestamp", "N/A")}</p>
"""
                    if failure.get("AdditionalData", {}).get("Output"):
                        html_content += f"""
                <p><strong>Output:</strong></p>
                <pre>{failure["AdditionalData"]["Output"]}</pre>
"""
                    html_content += """
            </div>
"""
            
            if failures.get("ProbePresence"):
                html_content += """
            <h3>Probe Presence Failures</h3>
"""
                for failure in failures["ProbePresence"]:
                    html_content += f"""
            <div class="failure-details">
                <h4>{failure.get("Resource", "Unknown Resource")}</h4>
                <p><strong>Container:</strong> {failure.get("AdditionalData", {}).get("Container", "N/A")}</p>
                <p><strong>Missing Probe:</strong> {failure.get("ProbeType", "N/A")}</p>
                <p><strong>Detail:</strong> {failure.get("Detail", "No details available")}</p>
                <p><strong>Timestamp:</strong> {failure.get("Timestamp", "N/A")}</p>
            </div>
"""
            
            if failures.get("InClusterHealth"):
                html_content += """
            <h3>In-Cluster Health Failures</h3>
"""
                for failure in failures["InClusterHealth"]:
                    html_content += f"""
            <div class="failure-details">
                <h4>{failure.get("AdditionalData", {}).get("Endpoint", "Unknown Endpoint")}</h4>
                <p><strong>Status Code:</strong> {failure.get("AdditionalData", {}).get("StatusCode", "N/A")}</p>
                <p><strong>Detail:</strong> {failure.get("Detail", "No details available")}</p>
                <p><strong>Timestamp:</strong> {failure.get("Timestamp", "N/A")}</p>
"""
                    if failure.get("AdditionalData", {}).get("Diagnostics"):
                        html_content += f"""
                <p><strong>Diagnostics:</strong></p>
                <pre>{failure["AdditionalData"]["Diagnostics"]}</pre>
"""
                    html_content += """
            </div>
"""
        
        html_content += """
        </div>
"""
    
    html_content += f"""
        <div class="footer">
            Full build log: <a href="{log_file_name}" class="log-link">{log_file_name}</a>
            <br>
            Report generated by probe diagnostics pipeline
        </div>
    </div>
</body>
</html>
"""
    
    # Write the HTML file
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 generate-probe-summary.py <build_log_file> <output_dir>")
        sys.exit(1)
    
    log_file = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    
    if not log_file.exists():
        print(f"Error: Log file not found: {log_file}", file=sys.stderr)
        sys.exit(1)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Parse log file
    log_results = parse_log_for_probe_results(log_file)
    
    # Look for probe-failures.json in the same directory as the log file
    failure_json_path = log_file.parent / "probe-failures.json"
    failure_data = load_failure_json(failure_json_path)
    
    # Generate HTML report
    output_file = output_dir / "probe-diagnostics-summary.html"
    generate_html_report(log_results, failure_data, log_file.name, output_file)
    
    print(f"Probe diagnostics summary generated: {output_file}")


if __name__ == "__main__":
    main()
