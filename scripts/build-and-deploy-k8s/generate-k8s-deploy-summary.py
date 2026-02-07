#!/usr/bin/env python3
"""
Generate a comprehensive HTML summary report for Kubernetes deployments.

This script aggregates results from:
- K8s manifest validation (kubeconform, helm template)
- Deployment rollout status
- Probe checks (presence and health)
- Smoke test results

Usage:
    python3 generate-k8s-deploy-summary.py <build_log_file> <output_dir>
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any


def parse_validation_results(log_content: str) -> Dict[str, Any]:
    """Parse K8s validation results from the build log."""
    results = {
        "status": "UNKNOWN",
        "checks": [],
        "errors": []
    }
    
    # Check if validation passed
    if "K8s validation passed" in log_content:
        results["status"] = "PASSED"
    elif "k8s-validate" in log_content and ("ERROR" in log_content or "fail" in log_content.lower()):
        results["status"] = "FAILED"
    elif "k8s-validate" in log_content:
        results["status"] = "PASSED"
    
    # Parse validation steps
    validation_section = re.search(
        r'Running K8s manifest validation.*?K8s validation passed',
        log_content,
        re.DOTALL | re.IGNORECASE
    )
    
    if validation_section:
        validation_text = validation_section.group(0)
        
        # Look for kubeconform checks
        if "kubeconform" in validation_text.lower():
            results["checks"].append({
                "name": "Kubeconform Schema Validation",
                "status": "PASSED" if "K8s validation passed" in log_content else "FAILED"
            })
        
        # Look for helm template checks
        if "helm template" in validation_text.lower():
            results["checks"].append({
                "name": "Helm Template Rendering",
                "status": "PASSED" if "K8s validation passed" in log_content else "FAILED"
            })
        
        # Look for kind config validation
        if "kind-config" in validation_text.lower() or "kind config" in validation_text.lower():
            results["checks"].append({
                "name": "Kind Config YAML",
                "status": "PASSED" if "K8s validation passed" in log_content else "FAILED"
            })
    
    return results


def parse_probe_results(log_content: str) -> Dict[str, Any]:
    """Parse probe check results from the build log."""
    results = {
        "rollout_checks": [],
        "probe_presence_checks": [],
        "incluster_health_checks": [],
        "overall_status": "UNKNOWN"
    }
    
    # Check overall probe status
    if "Probe-aware smoke checks passed" in log_content:
        results["overall_status"] = "PASSED"
    elif "PROBE SMOKE FAILED" in log_content:
        results["overall_status"] = "FAILED"
    
    # Parse rollout checks
    rollout_matches = re.finditer(
        r'  \+ (deployment|statefulset)/(\S+) rolled out',
        log_content
    )
    for match in rollout_matches:
        results["rollout_checks"].append({
            "type": match.group(1),
            "name": match.group(2),
            "status": "PASSED"
        })
    
    rollout_fail_matches = re.finditer(
        r'  x (deployment|statefulset)/(\S+) rollout timed out or failed',
        log_content
    )
    for match in rollout_fail_matches:
        results["rollout_checks"].append({
            "type": match.group(1),
            "name": match.group(2),
            "status": "FAILED"
        })
    
    # Parse probe presence checks
    probe_pass_matches = re.finditer(
        r'  \+ (Deployment|StatefulSet)/(\S+) container=(\S+): (\w+Probe) present',
        log_content
    )
    for match in probe_pass_matches:
        results["probe_presence_checks"].append({
            "resource_type": match.group(1),
            "resource_name": match.group(2),
            "container": match.group(3),
            "probe_type": match.group(4),
            "status": "PASSED"
        })
    
    probe_fail_matches = re.finditer(
        r'  x (Deployment|StatefulSet)/(\S+) container=(\S+): MISSING (\w+Probe)',
        log_content
    )
    for match in probe_fail_matches:
        results["probe_presence_checks"].append({
            "resource_type": match.group(1),
            "resource_name": match.group(2),
            "container": match.group(3),
            "probe_type": match.group(4),
            "status": "FAILED"
        })
    
    # Parse in-cluster health checks
    health_pass_matches = re.finditer(
        r'  \+ In-cluster HTTP (readiness|liveness|startup|health): (\S+) → (\d+)',
        log_content
    )
    for match in health_pass_matches:
        results["incluster_health_checks"].append({
            "probe_type": match.group(1),
            "endpoint": match.group(2),
            "status_code": match.group(3),
            "status": "PASSED"
        })
    
    health_fail_matches = re.finditer(
        r'  x In-cluster HTTP (readiness|liveness|startup|health): (\S+) → (\d+|failed)',
        log_content
    )
    for match in health_fail_matches:
        results["incluster_health_checks"].append({
            "probe_type": match.group(1),
            "endpoint": match.group(2),
            "status_code": match.group(3),
            "status": "FAILED"
        })
    
    return results


def load_failure_json(failure_json_path: Path) -> Optional[Dict[str, Any]]:
    """Load failure data from probe-failures.json if it exists."""
    if not failure_json_path.exists():
        return None
    
    try:
        with open(failure_json_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: Failed to load {failure_json_path}: {e}", file=sys.stderr)
        return None


def determine_overall_status(validation: Dict, probe: Dict) -> str:
    """Determine the overall deployment status."""
    if validation["status"] == "FAILED" or probe["overall_status"] == "FAILED":
        return "FAILED"
    elif validation["status"] == "PASSED" and probe["overall_status"] == "PASSED":
        return "PASSED"
    elif validation["status"] == "PASSED" or probe["overall_status"] == "PASSED":
        return "PARTIAL"
    else:
        return "UNKNOWN"


def generate_html_report(
    validation_results: Dict[str, Any],
    probe_results: Dict[str, Any],
    failure_data: Optional[Dict[str, Any]],
    log_file_name: str,
    output_file: Path
):
    """Generate a comprehensive HTML summary report."""
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    overall_status = determine_overall_status(validation_results, probe_results)
    
    # Count statistics
    validation_passed = sum(1 for c in validation_results["checks"] if c["status"] == "PASSED")
    validation_failed = sum(1 for c in validation_results["checks"] if c["status"] == "FAILED")
    
    rollout_passed = sum(1 for c in probe_results["rollout_checks"] if c["status"] == "PASSED")
    rollout_failed = sum(1 for c in probe_results["rollout_checks"] if c["status"] == "FAILED")
    
    probe_presence_passed = sum(1 for c in probe_results["probe_presence_checks"] if c["status"] == "PASSED")
    probe_presence_failed = sum(1 for c in probe_results["probe_presence_checks"] if c["status"] == "FAILED")
    
    health_passed = sum(1 for c in probe_results["incluster_health_checks"] if c["status"] == "PASSED")
    health_failed = sum(1 for c in probe_results["incluster_health_checks"] if c["status"] == "FAILED")
    
    status_color = {
        "PASSED": "#28a745",
        "FAILED": "#dc3545",
        "PARTIAL": "#ffc107",
        "UNKNOWN": "#6c757d"
    }
    
    status_emoji = {
        "PASSED": "✅",
        "FAILED": "❌",
        "PARTIAL": "⚠️",
        "UNKNOWN": "❓"
    }
    
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>K8s Deployment Summary Report</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            line-height: 1.6;
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
            padding: 40px;
            text-align: center;
        }}
        .header h1 {{
            font-size: 2.8em;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        }}
        .header .timestamp {{
            font-size: 1.1em;
            opacity: 0.9;
            margin-top: 10px;
        }}
        .status-banner {{
            padding: 25px;
            text-align: center;
            font-size: 1.8em;
            font-weight: bold;
            color: white;
            background-color: {status_color[overall_status]};
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        }}
        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
        }}
        .summary-card {{
            background: white;
            border-radius: 10px;
            padding: 25px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }}
        .summary-card:hover {{
            transform: translateY(-5px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.15);
        }}
        .summary-card h3 {{
            color: #495057;
            margin-bottom: 20px;
            font-size: 1.2em;
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .stat {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #e9ecef;
        }}
        .stat:last-child {{
            border-bottom: none;
        }}
        .stat-label {{
            color: #6c757d;
            font-weight: 500;
        }}
        .stat-value {{
            font-weight: bold;
            font-size: 1.3em;
        }}
        .stat-value.passed {{
            color: #28a745;
        }}
        .stat-value.failed {{
            color: #dc3545;
        }}
        .stat-value.total {{
            color: #667eea;
        }}
        .section {{
            padding: 30px;
        }}
        .section h2 {{
            color: #495057;
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 3px solid #667eea;
            font-size: 1.8em;
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .section h3 {{
            color: #495057;
            margin: 25px 0 15px 0;
            font-size: 1.4em;
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }}
        thead {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }}
        th, td {{
            padding: 15px;
            text-align: left;
        }}
        th {{
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.85em;
            letter-spacing: 0.5px;
        }}
        tbody tr:nth-child(even) {{
            background: #f8f9fa;
        }}
        tbody tr:hover {{
            background: #e9ecef;
            transition: background 0.2s;
        }}
        .badge {{
            display: inline-block;
            padding: 6px 14px;
            border-radius: 14px;
            font-size: 0.85em;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
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
            border-left: 5px solid #ffc107;
            padding: 20px;
            margin: 20px 0;
            border-radius: 6px;
        }}
        .failure-details h4 {{
            color: #856404;
            margin-bottom: 15px;
            font-size: 1.1em;
        }}
        .failure-details p {{
            margin: 8px 0;
            color: #856404;
        }}
        .failure-details pre {{
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            overflow-x: auto;
            font-size: 0.9em;
            margin-top: 10px;
            border: 1px solid #dee2e6;
        }}
        .footer {{
            padding: 30px;
            text-align: center;
            background: #f8f9fa;
            color: #6c757d;
            font-size: 0.95em;
            border-top: 2px solid #e9ecef;
        }}
        .log-link {{
            color: #667eea;
            text-decoration: none;
            font-weight: bold;
            transition: color 0.2s;
        }}
        .log-link:hover {{
            color: #764ba2;
            text-decoration: underline;
        }}
        .no-data {{
            text-align: center;
            padding: 40px;
            color: #6c757d;
            font-style: italic;
        }}
        .icon {{
            font-size: 1.2em;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>
                <span class="icon">☸️</span>
                Kubernetes Deployment Summary
            </h1>
            <div class="timestamp">Generated: {timestamp}</div>
        </div>
        
        <div class="status-banner">
            <span>{status_emoji[overall_status]}</span>
            <span>Overall Status: {overall_status}</span>
        </div>
        
        <div class="summary-grid">
            <div class="summary-card">
                <h3><span class="icon">🔍</span> Validation Checks</h3>
                <div class="stat">
                    <span class="stat-label">Passed</span>
                    <span class="stat-value passed">{validation_passed}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Failed</span>
                    <span class="stat-value failed">{validation_failed}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Total</span>
                    <span class="stat-value total">{validation_passed + validation_failed}</span>
                </div>
            </div>
            
            <div class="summary-card">
                <h3><span class="icon">📊</span> Rollout Status</h3>
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
                    <span class="stat-value total">{rollout_passed + rollout_failed}</span>
                </div>
            </div>
            
            <div class="summary-card">
                <h3><span class="icon">🔬</span> Probe Presence</h3>
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
                    <span class="stat-value total">{probe_presence_passed + probe_presence_failed}</span>
                </div>
            </div>
            
            <div class="summary-card">
                <h3><span class="icon">🌐</span> Health Checks</h3>
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
                    <span class="stat-value total">{health_passed + health_failed}</span>
                </div>
            </div>
        </div>
"""
    
    # Validation section
    if validation_results["checks"]:
        html_content += """
        <div class="section">
            <h2><span class="icon">🔍</span> Validation Results</h2>
            <table>
                <thead>
                    <tr>
                        <th>Check Name</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
"""
        for check in validation_results["checks"]:
            status_class = "passed" if check["status"] == "PASSED" else "failed"
            html_content += f"""
                    <tr>
                        <td>{check["name"]}</td>
                        <td><span class="badge {status_class}">{check["status"]}</span></td>
                    </tr>
"""
        html_content += """
                </tbody>
            </table>
        </div>
"""
    
    # Rollout checks section
    if probe_results["rollout_checks"]:
        html_content += """
        <div class="section">
            <h2><span class="icon">📊</span> Deployment Rollout Status</h2>
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
        for check in probe_results["rollout_checks"]:
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
    if probe_results["probe_presence_checks"]:
        html_content += """
        <div class="section">
            <h2><span class="icon">🔬</span> Probe Presence Checks</h2>
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
        for check in probe_results["probe_presence_checks"]:
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
    if probe_results["incluster_health_checks"]:
        html_content += """
        <div class="section">
            <h2><span class="icon">🌐</span> In-Cluster Health Checks</h2>
            <table>
                <thead>
                    <tr>
                        <th>Probe Type</th>
                        <th>Endpoint</th>
                        <th>HTTP Status Code</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
"""
        for check in probe_results["incluster_health_checks"]:
            status_class = "passed" if check["status"] == "PASSED" else "failed"
            html_content += f"""
                    <tr>
                        <td>{check["probe_type"]}</td>
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
    if failure_data and failure_data.get("Failures"):
        html_content += """
        <div class="section">
            <h2><span class="icon">⚠️</span> Detailed Failure Diagnostics</h2>
"""
        
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
                    output_text = failure["AdditionalData"]["Output"]
                    # Escape HTML special characters
                    output_text = output_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    html_content += f"""
                <p><strong>Output:</strong></p>
                <pre>{output_text}</pre>
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
                <p><strong>Probe Type:</strong> {failure.get("ProbeType", "N/A")}</p>
                <p><strong>Status Code:</strong> {failure.get("AdditionalData", {}).get("StatusCode", "N/A")}</p>
                <p><strong>Detail:</strong> {failure.get("Detail", "No details available")}</p>
                <p><strong>Timestamp:</strong> {failure.get("Timestamp", "N/A")}</p>
"""
                if failure.get("AdditionalData", {}).get("Diagnostics"):
                    diagnostics_text = failure["AdditionalData"]["Diagnostics"]
                    # Escape HTML special characters
                    diagnostics_text = diagnostics_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    html_content += f"""
                <p><strong>Diagnostics:</strong></p>
                <pre>{diagnostics_text}</pre>
"""
                html_content += """
            </div>
"""
        
        html_content += """
        </div>
"""
    
    html_content += f"""
        <div class="footer">
            <p>
                <strong>Full Build Log:</strong> 
                <a href="{log_file_name}" class="log-link">{log_file_name}</a>
            </p>
            <p style="margin-top: 10px;">
                Report generated by Kubernetes deployment pipeline
            </p>
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
        print("Usage: python3 generate-k8s-deploy-summary.py <build_log_file> <output_dir>")
        sys.exit(1)
    
    log_file = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    
    if not log_file.exists():
        print(f"Error: Log file not found: {log_file}", file=sys.stderr)
        sys.exit(1)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Read log file
    try:
        with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
            log_content = f.read()
    except Exception as e:
        print(f"Error: Failed to read log file: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Parse validation and probe results
    validation_results = parse_validation_results(log_content)
    probe_results = parse_probe_results(log_content)
    
    # Look for probe-failures.json in the same directory as the log file
    failure_json_path = log_file.parent / "probe-failures.json"
    failure_data = load_failure_json(failure_json_path)
    
    # Extract timestamp from log file name for report naming
    log_basename = log_file.stem  # filename without extension
    # Extract readable timestamp if present in format: inv<inverse>__<timestamp>__<scriptname>
    timestamp_match = re.search(r'__(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})__', log_basename)
    if timestamp_match:
        timestamp_str = timestamp_match.group(1)
    else:
        timestamp_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    
    # Generate HTML report with timestamped filename
    output_file = output_dir / f"summary-k8s-deploy__{timestamp_str}.html"
    generate_html_report(validation_results, probe_results, failure_data, log_file.name, output_file)
    
    print(f"K8s deployment summary generated: {output_file}")


if __name__ == "__main__":
    main()
