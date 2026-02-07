#!/usr/bin/env python3
"""Generate an aggregated frontend test report index.html"""

from __future__ import annotations

import datetime as _dt
import html
import os
from pathlib import Path


def _repo_root() -> Path:
    """Get repository root (2 levels up from this script)."""
    return Path(__file__).resolve().parents[2]


def _rel(from_dir: Path, to_path: Path) -> str:
    """Get relative path from from_dir to to_path."""
    try:
        return os.path.relpath(str(to_path), start=str(from_dir)).replace("\\", "/")
    except Exception:
        return str(to_path).replace("\\", "/")


def _check_report_exists(report_path: Path) -> tuple[bool, str]:
    """Check if a report exists and return status."""
    if report_path.exists():
        return True, "✓ Available"
    return False, "✗ Not found"


def _render_html(frontend_root: Path, build_log_dir: Path) -> str:
    """Render the HTML index page."""
    now = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    repo_root = _repo_root()
    base_href = _rel(build_log_dir, repo_root).rstrip("/") + "/"

    # Report paths
    vitest_coverage = frontend_root / "crm-ui" / "coverage" / "index.html"
    playwright_report = frontend_root / "crm-ui" / "playwright-report" / "index.html"

    # Check existence
    vitest_exists, vitest_status = _check_report_exists(vitest_coverage)
    playwright_exists, playwright_status = _check_report_exists(playwright_report)

    # Build report rows
    reports = [
        {
            "name": "Unit Test Coverage (Vitest)",
            "description": "Code coverage from unit tests",
            "path": vitest_coverage,
            "exists": vitest_exists,
            "status": vitest_status,
        },
        {
            "name": "E2E Test Report (Playwright)",
            "description": "End-to-end test results",
            "path": playwright_report,
            "exists": playwright_exists,
            "status": playwright_status,
        },
    ]

    rows = []
    for report in reports:
        if report["exists"]:
            rel_path = _rel(repo_root, report["path"])
            file_uri = report["path"].resolve().as_uri()
            status_class = "status-ok"
            link_html = (
                f'<a href="{html.escape(rel_path, quote=True)}" '
                f'data-file-uri="{html.escape(file_uri, quote=True)}" '
                f'target="_blank" rel="noopener">'
                f'<code class="mono">{html.escape(rel_path)}</code>'
                "</a>"
            )
        else:
            status_class = "status-missing"
            link_html = f'<span class="na">{html.escape(report["status"])}</span>'

        rows.append(
            "<tr>"
            f'<td><strong>{html.escape(report["name"])}</strong>'
            f'<div class="desc">{html.escape(report["description"])}</div></td>'
            f'<td class="{status_class}">{html.escape(report["status"])}</td>'
            f'<td class="paths">{link_html}</td>'
            "</tr>"
        )

    rows_html = "\n".join(rows)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base href="{html.escape(base_href, quote=True)}" />
  <title>Frontend Test Reports</title>
  <style>
    :root {{
      --bg: #0b0f14;
      --fg: #e8eef5;
      --muted: #9fb0c3;
      --border: #243241;
      --link: #8bd5ff;
      --card: #111825;
      --green: #49c36b;
      --red: #d64b4b;
    }}
    html, body {{ background: var(--bg); color: var(--fg); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }}
    .wrap {{ max-width: 1000px; margin: 24px auto; padding: 0 16px; }}
    .card {{ background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }}
    h1 {{ margin: 0 0 8px 0; font-size: 22px; }}
    .meta {{ color: var(--muted); font-size: 13px; margin-bottom: 16px; }}
    .table-wrap {{ overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 10px; border-top: 1px solid var(--border); }}
    table {{ width: 100%; border-collapse: collapse; min-width: 700px; }}
    th, td {{ border-top: 1px solid var(--border); padding: 12px 8px; vertical-align: top; }}
    th {{ text-align: left; color: var(--muted); font-weight: 600; }}
    .desc {{ color: var(--muted); font-size: 12px; margin-top: 4px; }}
    .mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }}
    .paths {{ max-width: 420px; word-break: break-word; }}
    .na {{ color: var(--muted); font-size: 13px; }}
    .status-ok {{ color: var(--green); font-weight: 600; }}
    .status-missing {{ color: var(--red); font-weight: 600; }}
    a {{ color: var(--link); text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    .info-box {{ background: rgba(73, 195, 107, 0.1); border: 1px solid rgba(73, 195, 107, 0.3); border-radius: 8px; padding: 12px; margin-top: 16px; }}
    .info-box strong {{ color: var(--green); }}
    .info-box p {{ margin: 4px 0; font-size: 13px; line-height: 1.5; }}
    @media (max-width: 640px) {{
      table {{ min-width: 600px; }}
      h1 {{ font-size: 20px; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Frontend Local Pipeline: Test Reports</h1>
      <div class="meta">Generated: {html.escape(now)}</div>

      <div class="info-box">
        <strong>📋 Available Reports</strong>
        <p>All frontend test reports are aggregated below. Click on the report paths to open them.</p>
      </div>

      <div class="table-wrap" role="region" aria-label="Frontend test reports">
        <table>
          <thead>
            <tr>
              <th>Report Type</th>
              <th>Status</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
{rows_html}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <script>
    (function () {{
      const href = String(window.location.href || "");
      const host = String(window.location.host || "");
      const protocol = String(window.location.protocol || "");
      const isVsCodePreview =
        href.includes("vscode-resource") ||
        href.includes("vscode-webview") ||
        host.includes("vscode-cdn.net") ||
        protocol === "vscode-webview:" ||
        protocol === "vscode-resource:";

      if (!isVsCodePreview) {{
        return;
      }}

      // In VS Code preview, use file:// URIs instead of relative paths
      for (const anchor of document.querySelectorAll("a[data-file-uri]")) {{
        const fileUri = anchor.getAttribute("data-file-uri");
        if (fileUri) {{
          anchor.setAttribute("href", fileUri);
        }}
      }}
    }})();
  </script>
</body>
</html>
"""


def main() -> int:
    """Generate the frontend report index."""
    repo_root = _repo_root()
    frontend_root = repo_root / "services" / "frontend"

    # Get build log directory from environment or use default
    build_log_dir_env = os.environ.get("BUILD_LOG_DIR")
    if build_log_dir_env:
        build_log_dir = Path(build_log_dir_env)
        if not build_log_dir.is_absolute():
            build_log_dir = repo_root / build_log_dir
    else:
        build_log_dir = repo_root / "build-logs" / "build-and-test-frontend"

    build_log_dir.mkdir(parents=True, exist_ok=True)

    # Generate HTML
    html_doc = _render_html(frontend_root, build_log_dir)
    out_file = build_log_dir / "index.html"
    out_file.write_text(html_doc, encoding="utf-8")

    print(f"[frontend-index] Wrote {out_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
