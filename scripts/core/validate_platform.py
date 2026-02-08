"""
Platform abstraction validation and testing.

Quick validation script to verify platform detection works correctly.
Run this to test the platform abstraction layer.

Usage:
    python scripts/core/validate_platform.py
"""

import sys
from pathlib import Path

# Add repository root to path for imports
repo_root = Path(__file__).parent.parent.parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from scripts.core.detect import (
    get_platform,
    get_platform_info,
    is_windows,
    is_unix,
    is_wsl,
    is_github_actions,
)
from scripts.core.logging import create_logger


def validate_platform_detection():
    """Validate platform detection."""
    print("=" * 80)
    print("VALIDATING PLATFORM DETECTION")
    print("=" * 80)
    
    platform = get_platform()
    info = get_platform_info()
    
    # Display detected platform
    print(f"\nPlatform Type: {info.platform_type.value}")
    print(f"Execution Context: {info.execution_context.value}")
    print(f"OS Name: {info.os_name}")
    print(f"OS Version: {info.os_version}")
    print(f"Architecture: {info.architecture}")
    print(f"Python Version: {info.python_version}")
    print(f"Shell: {info.shell}")
    print(f"Path Separator: {repr(info.path_separator)}")
    print(f"Line Ending: {repr(info.line_ending)}")
    
    print(f"\nFlags:")
    print(f"  is_windows: {info.is_windows}")
    print(f"  is_unix: {info.is_unix}")
    print(f"  is_wsl: {info.is_wsl}")
    print(f"  is_github_actions: {info.is_github_actions}")
    print(f"  is_docker: {info.is_docker}")
    
    # Test convenience functions
    print(f"\nConvenience Functions:")
    print(f"  is_windows(): {is_windows()}")
    print(f"  is_unix(): {is_unix()}")
    print(f"  is_wsl(): {is_wsl()}")
    print(f"  is_github_actions(): {is_github_actions()}")
    
    return True


def validate_path_operations():
    """Validate path operations."""
    print("\n" + "=" * 80)
    print("VALIDATING PATH OPERATIONS")
    print("=" * 80)
    
    platform = get_platform()
    
    # Test repo root detection
    try:
        repo_root = platform.get_repo_root()
        print(f"\nRepository Root: {repo_root}")
        print(f"  Exists: {repo_root.exists()}")
        print(f"  Is Directory: {repo_root.is_dir()}")
        
        # Check for expected files
        expected_files = [".git", "README.md", "scripts"]
        for expected in expected_files:
            path = repo_root / expected
            print(f"  Has {expected}: {path.exists()}")
    except Exception as e:
        print(f"\nERROR detecting repo root: {e}")
        return False
    
    # Test path normalization
    test_paths = [
        ".",
        "..",
        "scripts/core",
        "./scripts/core/platform.py",
    ]
    
    print("\nPath Normalization:")
    for test_path in test_paths:
        try:
            normalized = platform.normalize_path(test_path)
            print(f"  {test_path:30} -> {normalized}")
        except Exception as e:
            print(f"  {test_path:30} -> ERROR: {e}")
            return False
    
    return True


def validate_executable_finding():
    """Validate executable finding."""
    print("\n" + "=" * 80)
    print("VALIDATING EXECUTABLE FINDING")
    print("=" * 80)
    
    platform = get_platform()
    
    # Common executables that should exist
    common_tools = {
        "python": True,   # Required
        "git": True,      # Required
        "java": False,    # Optional
        "node": False,    # Optional
        "kubectl": False, # Optional
    }
    
    print("\nSearching for executables:")
    for tool, required in common_tools.items():
        try:
            exe_path = platform.find_executable(tool, required=False)
            if exe_path:
                print(f"  ✓ {tool:15} -> {exe_path}")
            else:
                status = "MISSING (required)" if required else "not found (optional)"
                print(f"  - {tool:15} -> {status}")
        except Exception as e:
            print(f"  ✗ {tool:15} -> ERROR: {e}")
            if required:
                return False
    
    return True


def validate_logging():
    """Validate logging system."""
    print("\n" + "=" * 80)
    print("VALIDATING LOGGING SYSTEM")
    print("=" * 80)
    
    try:
        # Create test logger
        logger = create_logger(
            name="Platform Validation Test",
            prefix="test_",
        )
        
        print(f"\nLogger created:")
        print(f"  Name: {logger.name}")
        print(f"  Log file: {logger.log_file}")
        print(f"  HTML file: {logger.html_file}")
        
        # Test log levels
        print("\nTesting log levels:")
        logger.info("This is an info message")
        logger.success("This is a success message")
        logger.warning("This is a warning message")
        logger.debug("This is a debug message (may not appear)")
        
        # Test grouping
        with logger.group("Test Group"):
            logger.info("Message inside group")
        
        # Test timing
        with logger.timer("Test Operation"):
            import time
            time.sleep(0.1)
        
        # Close and generate reports
        logger.close()
        
        # Verify files were created
        if logger.log_file and logger.log_file.exists():
            print(f"\n✓ Log file created: {logger.log_file}")
        else:
            print(f"\n✗ Log file not created")
            return False
        
        if logger.html_file and logger.html_file.exists():
            print(f"✓ HTML report created: {logger.html_file}")
        else:
            print(f"✗ HTML report not created")
            return False
        
        return True
    
    except Exception as e:
        print(f"\nERROR in logging validation: {e}")
        import traceback
        traceback.print_exc()
        return False


def validate_platform_specific():
    """Validate platform-specific utilities."""
    print("\n" + "=" * 80)
    print("VALIDATING PLATFORM-SPECIFIC UTILITIES")
    print("=" * 80)
    
    info = get_platform_info()
    
    try:
        if info.is_windows:
            print("\nWindows-specific validation:")
            from scripts.platform.windows import (
                WindowsConsoleManager,
                setup_windows_encoding,
                normalize_windows_path,
            )
            
            # Test console manager
            manager = WindowsConsoleManager()
            input_cp = manager.get_console_input_cp()
            output_cp = manager.get_console_output_cp()
            print(f"  Console Input CP: {input_cp}")
            print(f"  Console Output CP: {output_cp}")
            
            # Test path normalization
            test_path = "C:\\Users\\Test\\file.txt"
            normalized = normalize_windows_path(test_path)
            print(f"  Path normalization: {test_path} -> {normalized}")
            
            print("  ✓ Windows utilities working")
        
        elif info.is_unix:
            print("\nUnix-specific validation:")
            from scripts.platform.unix import (
                detect_package_manager,
                get_shell,
                is_tool_installed,
                normalize_unix_path,
                get_cpu_count,
            )
            
            # Test package manager detection
            pkg_mgr = detect_package_manager()
            print(f"  Package Manager: {pkg_mgr.value}")
            
            # Test shell detection
            shell = get_shell()
            print(f"  Shell: {shell}")
            
            # Test CPU count
            cpu_count = get_cpu_count()
            print(f"  CPU Count: {cpu_count}")
            
            # Test tool detection
            print(f"  bash installed: {is_tool_installed('bash')}")
            
            # Test path normalization
            test_path = "~/test/file.txt"
            normalized = normalize_unix_path(test_path)
            print(f"  Path normalization: {test_path} -> {normalized}")
            
            print("  ✓ Unix utilities working")
        
        if info.is_github_actions:
            print("\nGitHub Actions validation:")
            from scripts.platform.github_actions import (
                get_github_context,
                is_debug_enabled,
            )
            
            context = get_github_context()
            print(f"  Workflow: {context.workflow_name}")
            print(f"  Repository: {context.repository}")
            print(f"  Runner OS: {context.runner_os}")
            print(f"  Debug enabled: {is_debug_enabled()}")
            
            print("  ✓ GitHub Actions utilities working")
        
        return True
    
    except Exception as e:
        print(f"\nERROR in platform-specific validation: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all validation tests."""
    print("\n" + "=" * 80)
    print(" PLATFORM ABSTRACTION VALIDATION ".center(80, "="))
    print("=" * 80)
    
    results = {
        "Platform Detection": validate_platform_detection(),
        "Path Operations": validate_path_operations(),
        "Executable Finding": validate_executable_finding(),
        "Logging System": validate_logging(),
        "Platform-Specific": validate_platform_specific(),
    }
    
    # Summary
    print("\n" + "=" * 80)
    print(" VALIDATION SUMMARY ".center(80, "="))
    print("=" * 80)
    
    for test_name, passed in results.items():
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status} {test_name}")
    
    all_passed = all(results.values())
    
    if all_passed:
        print("\n✓ All validation tests passed!")
        return 0
    else:
        print("\n✗ Some validation tests failed!")
        return 1


if __name__ == "__main__":
    sys.exit(main())
