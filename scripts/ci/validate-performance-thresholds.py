#!/usr/bin/env python3
"""
Performance Threshold Validation Script

Validates JMeter performance test results against defined thresholds:
- Error rate: Percentage of failed requests (target: <1%, max: 5%)
- P95 latency: 95th percentile response time (target: <5000ms)

Usage:
    python validate-performance-thresholds.py \
        --results-csv build-logs/performance/.../results.csv \
        --error-rate-threshold 5.0 \
        --p95-latency-threshold 5000 \
        [--fail-on-violation]

Exit codes:
    0 - All thresholds passed
    1 - Threshold violation or error

JMeter CSV format (standard columns):
    0: timeStamp
    1: elapsed (response time in ms)
    2: label (request name)
    3: responseCode
    4: responseMessage
    5: threadName
    6: dataType
    7: success (true/false)
    8: failureMessage
    9: bytes
    10: sentBytes
    11: grpThreads
    12: allThreads
    13: URL
    14: Latency
    15: IdleTime
    16: Connect
"""

import argparse
import csv
import sys
from pathlib import Path
from typing import List, Tuple


class PerformanceThresholds:
    """Performance threshold validation logic"""

    def __init__(self, error_rate_threshold: float, p95_latency_threshold: int):
        self.error_rate_threshold = error_rate_threshold
        self.p95_latency_threshold = p95_latency_threshold

    def validate(self, results_csv: Path, fail_on_violation: bool) -> int:
        """
        Validate performance results against thresholds.

        Returns:
            0 if all thresholds pass
            1 if any threshold is violated (when fail_on_violation=True)
            1 if file not found or parsing error
        """
        if not results_csv.exists():
            print(f"[FAIL] Results CSV not found: {results_csv}")
            return 1

        try:
            results = self._parse_results(results_csv)
            metrics = self._calculate_metrics(results)
            violations = self._check_thresholds(metrics)

            self._print_summary(metrics, violations)

            if violations and fail_on_violation:
                print("\n[FAIL] Performance thresholds violated")
                return 1
            elif violations:
                print("\n[WARN] Performance thresholds violated (not failing)")
                return 0
            else:
                print("\n[PASS] All performance thresholds met")
                return 0

        except Exception as e:
            print(f"[ERROR] Failed to validate thresholds: {e}")
            return 1

    def _parse_results(self, results_csv: Path) -> List[dict]:
        """Parse JMeter CSV results file"""
        results = []

        with open(results_csv, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)

            for row in reader:
                try:
                    results.append({
                        'timestamp': int(row.get('timeStamp', 0)),
                        'elapsed': int(row.get('elapsed', 0)),
                        'label': row.get('label', 'unknown'),
                        'response_code': row.get('responseCode', ''),
                        'success': row.get('success', 'false').lower() == 'true',
                        'thread_name': row.get('threadName', ''),
                        'latency': int(row.get('Latency', 0)),
                    })
                except (ValueError, KeyError) as e:
                    print(f"[WARN] Skipping malformed row: {e}")
                    continue

        if not results:
            raise ValueError("No valid results found in CSV")

        return results

    def _calculate_metrics(self, results: List[dict]) -> dict:
        """Calculate performance metrics from results"""
        total_requests = len(results)
        failed_requests = sum(1 for r in results if not r['success'])
        error_rate = (failed_requests / total_requests * 100) if total_requests > 0 else 0

        # Calculate P95 latency from elapsed times
        elapsed_times = sorted([r['elapsed'] for r in results])
        p95_index = int(len(elapsed_times) * 0.95)
        p95_latency = elapsed_times[p95_index] if elapsed_times else 0

        # Calculate average response time
        avg_response_time = sum(r['elapsed'] for r in results) / total_requests if total_requests > 0 else 0

        # Group by label for detailed analysis
        label_stats = {}
        for result in results:
            label = result['label']
            if label not in label_stats:
                label_stats[label] = {'total': 0, 'failed': 0, 'times': []}

            label_stats[label]['total'] += 1
            if not result['success']:
                label_stats[label]['failed'] += 1
            label_stats[label]['times'].append(result['elapsed'])

        return {
            'total_requests': total_requests,
            'failed_requests': failed_requests,
            'error_rate': error_rate,
            'p95_latency': p95_latency,
            'avg_response_time': avg_response_time,
            'label_stats': label_stats,
        }

    def _check_thresholds(self, metrics: dict) -> List[str]:
        """Check metrics against thresholds and return violations"""
        violations = []

        if metrics['error_rate'] > self.error_rate_threshold:
            violations.append(
                f"Error rate {metrics['error_rate']:.2f}% exceeds threshold {self.error_rate_threshold}%"
            )

        if metrics['p95_latency'] > self.p95_latency_threshold:
            violations.append(
                f"P95 latency {metrics['p95_latency']}ms exceeds threshold {self.p95_latency_threshold}ms"
            )

        return violations

    def _print_summary(self, metrics: dict, violations: List[str]):
        """Print performance metrics summary"""
        print("\n" + "=" * 60)
        print("  Performance Metrics Summary")
        print("=" * 60)
        print(f"\nOverall Metrics:")
        print(f"  Total Requests:     {metrics['total_requests']:,}")
        print(f"  Failed Requests:    {metrics['failed_requests']:,}")
        print(f"  Error Rate:         {metrics['error_rate']:.2f}%")
        print(f"  Avg Response Time:  {metrics['avg_response_time']:.0f}ms")
        print(f"  P95 Latency:        {metrics['p95_latency']:,}ms")

        print(f"\nThresholds:")
        print(f"  Error Rate:         <{self.error_rate_threshold}%")
        print(f"  P95 Latency:        <{self.p95_latency_threshold:,}ms")

        # Print per-endpoint breakdown
        print(f"\nPer-Endpoint Breakdown:")
        for label, stats in sorted(metrics['label_stats'].items()):
            error_rate = (stats['failed'] / stats['total'] * 100) if stats['total'] > 0 else 0
            avg_time = sum(stats['times']) / len(stats['times']) if stats['times'] else 0
            p95_time = sorted(stats['times'])[int(len(stats['times']) * 0.95)] if stats['times'] else 0

            print(f"\n  {label}:")
            print(f"    Requests:     {stats['total']:,}")
            print(f"    Failures:     {stats['failed']:,}")
            print(f"    Error Rate:   {error_rate:.2f}%")
            print(f"    Avg Time:     {avg_time:.0f}ms")
            print(f"    P95 Time:     {p95_time:,}ms")

        if violations:
            print(f"\n{'!' * 60}")
            print("  THRESHOLD VIOLATIONS")
            print('!' * 60)
            for violation in violations:
                print(f"  - {violation}")
            print('!' * 60)
        else:
            print(f"\n{'-' * 60}")
            print("  All thresholds passed")
            print('-' * 60)


def main():
    parser = argparse.ArgumentParser(
        description='Validate JMeter performance test results against thresholds',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument(
        '--results-csv',
        type=Path,
        required=True,
        help='Path to JMeter results CSV file'
    )

    parser.add_argument(
        '--error-rate-threshold',
        type=float,
        default=5.0,
        help='Maximum acceptable error rate percentage (default: 5.0%%)'
    )

    parser.add_argument(
        '--p95-latency-threshold',
        type=int,
        default=5000,
        help='Maximum acceptable P95 latency in milliseconds (default: 5000ms)'
    )

    parser.add_argument(
        '--fail-on-violation',
        action='store_true',
        help='Exit with code 1 if thresholds are violated (default: warn only)'
    )

    args = parser.parse_args()

    validator = PerformanceThresholds(
        error_rate_threshold=args.error_rate_threshold,
        p95_latency_threshold=args.p95_latency_threshold
    )

    exit_code = validator.validate(args.results_csv, args.fail_on_violation)
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
