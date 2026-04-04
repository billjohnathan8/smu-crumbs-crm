import {
  Line,
  LineChart,
  Pie,
  PieChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts'

export interface ActivityTrendPoint {
  date: string
  create: number
  update: number
  delete: number
}

export interface VerificationStatusPoint {
  name: string
  value: number
  color: string
}

export interface NewClientsPoint {
  date: string
  clients: number
}

interface ActivityTrendChartProps {
  data: ActivityTrendPoint[]
  isLoading?: boolean
}

interface VerificationStatusChartProps {
  data: VerificationStatusPoint[]
  isLoading?: boolean
}

interface NewClientsChartProps {
  data: NewClientsPoint[]
  isLoading?: boolean
}

const CHART_MARGIN = { top: 16, right: 24, left: 0, bottom: 8 }

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="h-72 flex items-center justify-center text-sm text-text-subtle">{message}</div>
  )
}

export function ActivityTrendChart({ data, isLoading = false }: ActivityTrendChartProps) {
  if (isLoading) {
    return (
      <div className="h-72 flex items-center justify-center" role="status">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!data.length) {
    return <EmptyChartState message="No activity data in the selected range." />
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              backgroundColor: 'var(--card)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontSize: '10px',
            }}
          />
          <Legend />
          <Line type="monotone" dataKey="create" stroke="#22c55e" strokeWidth={2.5} name="create" />
          <Line type="monotone" dataKey="update" stroke="#f59e0b" strokeWidth={2.5} name="update" />
          <Line type="monotone" dataKey="delete" stroke="#ef4444" strokeWidth={2.5} name="delete" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function VerificationStatusChart({ data, isLoading = false }: VerificationStatusChartProps) {
  if (isLoading) {
    return (
      <div className="h-72 flex items-center justify-center" role="status">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    )
  }

  const hasAny = data.some(item => item.value > 0)
  if (!hasAny) {
    return <EmptyChartState message="No verification data available." />
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              backgroundColor: 'var(--card)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontSize: '10px',
            }}
          />
          <Legend verticalAlign="bottom" height={36} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="45%"
            outerRadius={95}
            label={({ name, value }) => (value > 0 ? `${name}: ${value}` : '')}
          >
            {data.map(entry => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export function NewClientsChart({ data, isLoading = false }: NewClientsChartProps) {
  if (isLoading) {
    return (
      <div className="h-72 flex items-center justify-center" role="status">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!data.length) {
    return <EmptyChartState message="No client creation data in the selected range." />
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGIN}>
          <defs>
            <linearGradient id="newClientsDarkRedGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--dark-red)" />
              <stop offset="100%" stopColor="var(--red)" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              backgroundColor: 'var(--card)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontSize: '10px',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '10px' }}
            formatter={value => <span style={{ color: 'var(--text)' }}>{value}</span>}
          />
          <Line
            type="monotone"
            dataKey="clients"
            stroke="url(#newClientsDarkRedGradient)"
            strokeWidth={2.5}
            dot={{ fill: 'var(--red)', stroke: 'var(--dark-red)', strokeWidth: 1 }}
            activeDot={{ fill: 'var(--red)', stroke: 'var(--dark-red)', strokeWidth: 2, r: 5 }}
            name="new clients"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
