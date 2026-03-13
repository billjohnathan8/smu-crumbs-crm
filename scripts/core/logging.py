"""
Unified logging with HTML report generation.

Provides platform-agnostic logging that:
- Writes to console with appropriate formatting (Windows/Unix/GitHub Actions)
- Generates HTML reports with timing and status
- Supports log rotation
- Provides progress tracking
- Fail-fast error reporting

Design principles:
- Real-time output (no buffering)
- Platform-appropriate formatting
- Automatic HTML report generation
- Performance timing built-in
"""

import html
import sys
import time
from contextlib import contextmanager
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, TextIO, Generator

from scripts.core.detect import get_platform_info, is_github_actions

DEFAULT_LOG_RETENTION = 3


class LogLevel(Enum):
    """Log levels."""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    SUCCESS = "SUCCESS"


class Logger:
    """
    Unified logger with console and HTML output.
    
    Features:
    - Real-time console output
    - HTML report generation
    - Timing information
    - Progress tracking
    - Platform-appropriate formatting
    """
    
    def __init__(
        self,
        name: str,
        log_file: Optional[Path] = None,
        html_file: Optional[Path] = None,
        level: LogLevel = LogLevel.INFO,
        enable_console: bool = True,
        enable_html: bool = True,
    ):
        """
        Initialize logger.
        
        Args:
            name: Logger name (used in HTML title)
            log_file: Path to plain text log file (optional)
            html_file: Path to HTML report (optional)
            level: Minimum log level
            enable_console: Enable console output
            enable_html: Enable HTML report generation
        """
        self.name = name
        self.log_file = log_file
        self.html_file = html_file
        self.level = level
        self.enable_console = enable_console
        self.enable_html = enable_html
        
        self.platform = get_platform_info()
        self.start_time = time.time()
        self.entries: List[Dict] = []
        
        # File handles
        self._log_handle: Optional[TextIO] = None
        
        # Setup
        self._setup_console()
        self._open_log_file()
    
    def _setup_console(self):
        """Setup console output based on platform."""
        if self.platform.is_windows:
            # Windows UTF-8 setup is handled by windows.py
            # Just ensure unbuffered output
            sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None
        else:
            # Unix: Ensure UTF-8
            if hasattr(sys.stdout, 'reconfigure'):
                sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
                sys.stderr.reconfigure(encoding='utf-8', line_buffering=True)
    
    def _open_log_file(self):
        """Open log file for writing."""
        if self.log_file:
            self.log_file.parent.mkdir(parents=True, exist_ok=True)
            self._log_handle = open(self.log_file, 'w', encoding='utf-8', buffering=1)
    
    def _write_console(self, message: str, level: LogLevel):
        """Write to console with platform-appropriate formatting."""
        if not self.enable_console:
            return
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Color codes for Unix terminals
        if self.platform.is_unix and not is_github_actions():
            colors = {
                LogLevel.DEBUG: "\033[90m",      # Gray
                LogLevel.INFO: "\033[0m",        # Default
                LogLevel.WARNING: "\033[93m",    # Yellow
                LogLevel.ERROR: "\033[91m",      # Red
                LogLevel.SUCCESS: "\033[92m",    # Green
            }
            reset = "\033[0m"
            color = colors.get(level, "")
            formatted = f"{color}[{timestamp}] [{level.value}] {message}{reset}"
        else:
            # Windows or GitHub Actions: No colors
            formatted = f"[{timestamp}] [{level.value}] {message}"
        
        # Print to stdout (info, debug, success) or stderr (warning, error)
        stream = sys.stderr if level in (LogLevel.ERROR, LogLevel.WARNING) else sys.stdout
        print(formatted, file=stream, flush=True)
        
        # Write to log file
        if self._log_handle:
            self._log_handle.write(f"[{timestamp}] [{level.value}] {message}\n")
            self._log_handle.flush()
    
    def _add_entry(self, message: str, level: LogLevel):
        """Add entry to HTML report."""
        if not self.enable_html:
            return
        
        self.entries.append({
            "timestamp": datetime.now(),
            "level": level,
            "message": message,
            "elapsed": time.time() - self.start_time,
        })
    
    def debug(self, message: str):
        """Log debug message."""
        if self.level == LogLevel.DEBUG:
            self._write_console(message, LogLevel.DEBUG)
            self._add_entry(message, LogLevel.DEBUG)
    
    def info(self, message: str):
        """Log info message."""
        self._write_console(message, LogLevel.INFO)
        self._add_entry(message, LogLevel.INFO)
    
    def warning(self, message: str):
        """Log warning message."""
        self._write_console(message, LogLevel.WARNING)
        self._add_entry(message, LogLevel.WARNING)
        
        # GitHub Actions annotation
        if is_github_actions():
            from scripts.platform.github_actions import log_warning
            log_warning(message)
    
    def error(self, message: str):
        """Log error message."""
        self._write_console(message, LogLevel.ERROR)
        self._add_entry(message, LogLevel.ERROR)
        
        # GitHub Actions annotation
        if is_github_actions():
            from scripts.platform.github_actions import log_error
            log_error(message)
    
    def success(self, message: str):
        """Log success message."""
        self._write_console(message, LogLevel.SUCCESS)
        self._add_entry(message, LogLevel.SUCCESS)
    
    def section(self, title: str):
        """Log section header."""
        separator = "=" * 80
        self.info(separator)
        self.info(title.center(80))
        self.info(separator)
    
    @contextmanager
    def group(self, title: str) -> Generator[None, None, None]:
        """
        Context manager for log grouping.
        
        Usage:
            with logger.group("Building backend"):
                # Build steps
                pass
        """
        # GitHub Actions groups
        if is_github_actions():
            from scripts.platform.github_actions import start_group, end_group
            start_group(title)
        else:
            self.section(title)
        
        group_start = time.time()
        
        try:
            yield
        finally:
            elapsed = time.time() - group_start
            
            if is_github_actions():
                from scripts.platform.github_actions import end_group
                end_group()
            
            self.info(f"Completed '{title}' in {elapsed:.2f}s")
    
    @contextmanager
    def timer(self, operation: str) -> Generator[None, None, None]:
        """
        Context manager for timing operations.
        
        Usage:
            with logger.timer("Running tests"):
                # Test execution
                pass
        """
        self.info(f"Starting: {operation}")
        start = time.time()
        
        try:
            yield
        finally:
            elapsed = time.time() - start
            self.info(f"Completed: {operation} ({elapsed:.2f}s)")
    
    def fail_fast(self, message: str, exit_code: int = 1):
        """
        Log error and exit immediately.
        
        Args:
            message: Error message
            exit_code: Exit code (default: 1)
        """
        self.error(message)
        self.error(f"FATAL: Exiting with code {exit_code}")
        self.close()
        sys.exit(exit_code)
    
    def generate_html_report(self) -> str:
        """
        Generate HTML report from log entries.
        
        Returns:
            HTML content
        """
        total_elapsed = time.time() - self.start_time
        total_time_str = str(timedelta(seconds=int(total_elapsed)))
        
        # Count by level
        counts = {level: 0 for level in LogLevel}
        for entry in self.entries:
            counts[entry["level"]] += 1
        
        # Determine overall status
        if counts[LogLevel.ERROR] > 0:
            status = "FAILED"
            status_class = "failed"
        elif counts[LogLevel.WARNING] > 0:
            status = "WARNING"
            status_class = "warning"
        else:
            status = "SUCCESS"
            status_class = "success"
        
        # Generate HTML
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{html.escape(self.name)} - {status}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }}
        .container {{ max-width: 1400px; margin: 0 auto; }}
        .header {{
            background: white;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .header h1 {{
            font-size: 24px;
            margin-bottom: 10px;
            color: #333;
        }}
        .status {{
            display: inline-block;
            padding: 8px 16px;
            border-radius: 4px;
            font-weight: bold;
            margin: 10px 0;
        }}
        .status.success {{ background: #4caf50; color: white; }}
        .status.warning {{ background: #ff9800; color: white; }}
        .status.failed {{ background: #f44336; color: white; }}
        .stats {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            margin: 20px 0;
        }}
        .stat {{
            background: #f8f8f8;
            padding: 15px;
            border-radius: 4px;
            text-align: center;
        }}
        .stat-value {{ font-size: 24px; font-weight: bold; color: #333; }}
        .stat-label {{ font-size: 12px; color: #666; margin-top: 5px; }}
        .log-container {{
            background: #1e1e1e;
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .log-entry {{
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
            padding: 4px 0;
            white-space: pre-wrap;
            word-wrap: break-word;
        }}
        .log-entry.DEBUG {{ color: #888; }}
        .log-entry.INFO {{ color: #d4d4d4; }}
        .log-entry.WARNING {{ color: #ff9800; }}
        .log-entry.ERROR {{ color: #f44336; }}
        .log-entry.SUCCESS {{ color: #4caf50; }}
        .timestamp {{ color: #6a9fb5; }}
        .level {{ font-weight: bold; }}
        .footer {{
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{html.escape(self.name)}</h1>
            <div class="status {status_class}">{status}</div>
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">{total_time_str}</div>
                    <div class="stat-label">Duration</div>
                </div>
                <div class="stat">
                    <div class="stat-value">{counts[LogLevel.ERROR]}</div>
                    <div class="stat-label">Errors</div>
                </div>
                <div class="stat">
                    <div class="stat-value">{counts[LogLevel.WARNING]}</div>
                    <div class="stat-label">Warnings</div>
                </div>
                <div class="stat">
                    <div class="stat-value">{len(self.entries)}</div>
                    <div class="stat-label">Total Entries</div>
                </div>
            </div>
        </div>
        <div class="log-container">
"""
        
        for entry in self.entries:
            timestamp = entry["timestamp"].strftime("%H:%M:%S")
            level = entry["level"].value
            message = html.escape(entry["message"])
            elapsed = f"{entry['elapsed']:.2f}s"
            
            html_content += f'            <div class="log-entry {level}">'
            html_content += f'<span class="timestamp">[{timestamp}]</span> '
            html_content += f'<span class="level">[{level}]</span> '
            html_content += f'<span class="elapsed">({elapsed})</span> '
            html_content += f'{message}</div>\n'
        
        html_content += """        </div>
        <div class="footer">
            Generated by CS301-ITSA-Scroogebank-CRM Pipeline
        </div>
    </div>
</body>
</html>"""
        
        return html_content
    
    def save_html_report(self, path: Optional[Path] = None):
        """
        Save HTML report to file.
        
        Args:
            path: Output path (uses self.html_file if not provided)
        """
        if not self.enable_html:
            return
        
        output_path = path or self.html_file
        if not output_path:
            return
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        html_content = self.generate_html_report()
        output_path.write_text(html_content, encoding='utf-8')
        
        self.info(f"HTML report saved: {output_path}")
    
    def close(self):
        """Close logger and generate reports."""
        # Save HTML report
        if self.enable_html and self.html_file:
            self.save_html_report()
        
        # Close log file
        if self._log_handle:
            self._log_handle.close()
            self._log_handle = None
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        if exc_type is not None:
            self.error(f"Exception occurred: {exc_type.__name__}: {exc_val}")
        
        self.close()
        return False


def create_logger(
    name: str,
    log_dir: Optional[Path] = None,
    prefix: str = "",
    keep_logs: int = DEFAULT_LOG_RETENTION,
) -> Logger:
    """
    Create logger with auto-generated file names.
    
    Args:
        name: Logger name
        log_dir: Log directory (defaults to build-logs/<name>)
        prefix: Filename prefix
        keep_logs: Number of recent logs to keep per format
        
    Returns:
        Logger instance
    """
    from scripts.core.detect import get_platform
    
    platform = get_platform()
    repo_root = platform.get_repo_root()
    
    # Default log directory
    if log_dir is None:
        log_dir = repo_root / "build-logs" / name.lower().replace(" ", "-")
    
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate timestamp filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = f"{prefix}{timestamp}" if prefix else timestamp
    
    log_file = log_dir / f"{base_name}.log"
    html_file = log_dir / f"{base_name}.html"

    # Prune before opening this run's files so total retained logs stay bounded.
    keep_before_new_log = max(0, keep_logs - 1)
    rotate_logs(log_dir, pattern="*.log", keep=keep_before_new_log)
    rotate_logs(log_dir, pattern="*.html", keep=keep_before_new_log)
    
    return Logger(
        name=name,
        log_file=log_file,
        html_file=html_file,
        enable_console=True,
        enable_html=True,
    )


def rotate_logs(log_dir: Path, pattern: str = "*.log", keep: int = DEFAULT_LOG_RETENTION):
    """
    Rotate log files, keeping only the most recent.
    
    Args:
        log_dir: Directory containing logs
        pattern: File pattern to match
        keep: Number of recent logs to keep
    """
    if not log_dir.exists():
        return
    
    # Get all matching files sorted by modification time (newest first)
    log_files = sorted(
        log_dir.glob(pattern),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )
    
    if keep < 0:
        keep = 0

    # Delete old files
    for old_file in log_files[keep:]:
        try:
            old_file.unlink()
        except OSError:
            pass  # Ignore deletion errors
