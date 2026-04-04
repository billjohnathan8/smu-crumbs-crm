import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  ActivityTrendChart,
  NewClientsChart,
  VerificationStatusChart,
  type ActivityTrendPoint,
  type NewClientsPoint,
  type VerificationStatusPoint,
} from '../DashboardCharts'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-responsive">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-linechart">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-piechart">{children}</div>
  ),
  CartesianGrid: () => <div data-testid="recharts-grid" />,
  XAxis: () => <div data-testid="recharts-x-axis" />,
  YAxis: () => <div data-testid="recharts-y-axis" />,
  Tooltip: () => <div data-testid="recharts-tooltip" />,
  Legend: ({ formatter }: { formatter?: (value: string) => React.ReactNode }) => (
    <div data-testid="recharts-legend">{formatter ? formatter('legend-value') : null}</div>
  ),
  Line: () => <div data-testid="recharts-line" />,
  Pie: ({
    children,
    label,
  }: {
    children: React.ReactNode
    label?: (value: { name: string; value: number }) => string
  }) => (
    <div>
      {label ? label({ name: 'Pending', value: 3 }) : null}
      {children}
    </div>
  ),
  Cell: () => <div data-testid="recharts-cell" />,
}))

describe('DashboardCharts', () => {
  it('renders loading and empty states for ActivityTrendChart', () => {
    const { rerender } = render(<ActivityTrendChart data={[]} isLoading />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    rerender(<ActivityTrendChart data={[]} isLoading={false} />)
    expect(screen.getByText('No activity data in the selected range.')).toBeInTheDocument()
  })

  it('renders ActivityTrendChart when data exists', () => {
    const data: ActivityTrendPoint[] = [
      { date: 'Apr 1', create: 1, update: 2, delete: 0 },
      { date: 'Apr 2', create: 0, update: 1, delete: 1 },
    ]

    render(<ActivityTrendChart data={data} />)
    expect(screen.getByTestId('recharts-linechart')).toBeInTheDocument()
    expect(screen.getAllByTestId('recharts-line')).toHaveLength(3)
  })

  it('renders loading and empty states for VerificationStatusChart', () => {
    const { rerender } = render(<VerificationStatusChart data={[]} isLoading />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    const zeros: VerificationStatusPoint[] = [
      { name: 'Pending', value: 0, color: '#f59e0b' },
      { name: 'Approved', value: 0, color: '#22c55e' },
    ]

    rerender(<VerificationStatusChart data={zeros} isLoading={false} />)
    expect(screen.getByText('No verification data available.')).toBeInTheDocument()
  })

  it('renders VerificationStatusChart when at least one slice has value', () => {
    const data: VerificationStatusPoint[] = [
      { name: 'Pending', value: 2, color: '#f59e0b' },
      { name: 'Approved', value: 1, color: '#22c55e' },
    ]

    render(<VerificationStatusChart data={data} />)
    expect(screen.getByTestId('recharts-piechart')).toBeInTheDocument()
    expect(screen.getByText('Pending: 3')).toBeInTheDocument()
    expect(screen.getAllByTestId('recharts-cell')).toHaveLength(2)
  })

  it('renders loading and empty states for NewClientsChart', () => {
    const { rerender } = render(<NewClientsChart data={[]} isLoading />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    rerender(<NewClientsChart data={[]} isLoading={false} />)
    expect(screen.getByText('No client creation data in the selected range.')).toBeInTheDocument()
  })

  it('renders NewClientsChart when data exists', () => {
    const data: NewClientsPoint[] = [
      { date: 'Apr 1', clients: 1 },
      { date: 'Apr 2', clients: 3 },
    ]

    render(<NewClientsChart data={data} />)
    expect(screen.getByTestId('recharts-linechart')).toBeInTheDocument()
    expect(screen.getByTestId('recharts-legend')).toBeInTheDocument()
    expect(screen.getByText('legend-value')).toBeInTheDocument()
  })
})
