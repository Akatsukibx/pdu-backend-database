import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ResponsiveContainer,
    CartesianGrid,
    ReferenceLine
} from "recharts";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { getDeviceHistory } from "../api/pduService";

const PduHistoryChart = ({ deviceId }) => {
    const [data, setData] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            const end = dayjs().format("YYYY-MM-DD HH:mm:ss");
            const start = dayjs().subtract(7, "day").format("YYYY-MM-DD HH:mm:ss");

            const res = await getDeviceHistory(deviceId, start, end);

            const chartData = res.data.map(d => ({
                time: dayjs(d.polled_at).format("DD/MM HH:mm"),
                voltage: Number(d.voltage),
                power: Number(d.power),
                // scale current x100 เพื่อไม่ให้จมหาย
                current: Number(d.current) * 100,
            }));

            setData(chartData);
        };

        fetchData();
    }, [deviceId]);

    return (
        <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />

                <XAxis
                    dataKey="time"
                    tick={{ fill: "#aaa", fontSize: 12 }}
                    minTickGap={30}
                />

                {/* Left Y - Power & Current */}
                <YAxis
                    yAxisId="left"
                    tick={{ fill: "#aaa" }}
                    label={{
                        value: "Power (W) / Current (A x100)",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#aaa"
                    }}
                />

                {/* Right Y - Voltage */}
                <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[220, 240]}
                    tick={{ fill: "#aaa" }}
                    label={{
                        value: "Voltage (V)",
                        angle: 90,
                        position: "insideRight",
                        fill: "#aaa"
                    }}
                />

                {/* Nominal Voltage */}
                <ReferenceLine
                    yAxisId="right"
                    y={230}
                    stroke="#555"
                    strokeDasharray="4 4"
                    label="Nominal 230V"
                />

                {/* Power Loss Line */}
                <ReferenceLine
                    yAxisId="left"
                    y={0}
                    stroke="red"
                    strokeDasharray="4 4"
                    label="Power Loss"
                />

                <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "none" }}
                    formatter={(value, name) => {
                        if (name === "Voltage (V)") return [`${value} V`, name];
                        if (name === "Power (W)") return [`${value} W`, name];
                        if (name === "Current (A x100)")
                            return [`${(value / 100).toFixed(2)} A`, name];
                        return value;
                    }}
                />

                <Legend />

                {/* Power */}
                <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="power"
                    stroke="#ff9800"
                    strokeWidth={2}
                    dot={false}
                    name="Power (W)"
                />

                {/* Current */}
                <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="current"
                    stroke="#4caf50"
                    strokeWidth={2}
                    dot={false}
                    name="Current (A x100)"
                />

                {/* Voltage */}
                <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="voltage"
                    stroke="#90caf9"
                    strokeWidth={2}
                    dot={false}
                    name="Voltage (V)"
                />
            </LineChart>
        </ResponsiveContainer>
    );
};

export default PduHistoryChart;
