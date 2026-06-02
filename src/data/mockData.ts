export const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const performanceTrend = months.map((month, i) => ({
  month,
  average: Math.round((72 + Math.sin(i * 0.8) * 10 + i * 1.2) * 10) / 10,
}));

export const branches = [
  { name: 'Headquarters', score: 87 },
  { name: 'North Branch', score: 79 },
  { name: 'South Branch', score: 82 },
  { name: 'East Branch', score: 74 },
  { name: 'West Branch', score: 91 },
];

export const jobPositions = [
  { position: 'Engineering', score: 85 },
  { position: 'Sales', score: 78 },
  { position: 'Marketing', score: 82 },
  { position: 'Operations', score: 76 },
  { position: 'HR', score: 88 },
];

export const tierDistribution = [
  { name: 'Excellent (90-100%)', value: 18, fill: 'hsl(var(--chart-1))' },
  { name: 'Very Good (70-89%)', value: 42, fill: 'hsl(var(--chart-2))' },
  { name: 'Good (50-69%)', value: 28, fill: 'hsl(var(--chart-3))' },
  { name: 'Needs Follow-up (<50%)', value: 12, fill: 'hsl(var(--chart-5))' },
];

export const topEmployees = [
  { id: '1', name: 'Sarah Al-Rashid', branch: 'Headquarters', score: 97 },
  { id: '2', name: 'Ahmed Hassan', branch: 'West Branch', score: 95 },
  { id: '3', name: 'Fatima Noor', branch: 'Headquarters', score: 94 },
  { id: '4', name: 'Omar Khalil', branch: 'North Branch', score: 93 },
  { id: '5', name: 'Layla Mahmoud', branch: 'South Branch', score: 92 },
];

export const employees = [
  { id: '1', name: 'Sarah Al-Rashid', position: 'Senior Engineer', branch: 'Headquarters', manager: 'Dr. Khalid', score: 97, avatar: 'SA' },
  { id: '2', name: 'Ahmed Hassan', position: 'Sales Lead', branch: 'West Branch', manager: 'Ms. Fatima', score: 95, avatar: 'AH' },
  { id: '3', name: 'Fatima Noor', position: 'Marketing Mgr', branch: 'Headquarters', manager: 'Dr. Khalid', score: 94, avatar: 'FN' },
  { id: '4', name: 'Omar Khalil', position: 'Operations Analyst', branch: 'North Branch', manager: 'Mr. Ali', score: 93, avatar: 'OK' },
  { id: '5', name: 'Layla Mahmoud', position: 'HR Specialist', branch: 'South Branch', manager: 'Ms. Rania', score: 92, avatar: 'LM' },
  { id: '6', name: 'Youssef Tarek', position: 'Junior Developer', branch: 'East Branch', manager: 'Mr. Ali', score: 68, avatar: 'YT' },
  { id: '7', name: 'Nadia Samir', position: 'Accountant', branch: 'North Branch', manager: 'Ms. Rania', score: 45, avatar: 'NS' },
  { id: '8', name: 'Khaled Mostafa', position: 'IT Support', branch: 'West Branch', manager: 'Ms. Fatima', score: 78, avatar: 'KM' },
];

export const trainingRequests = [
  { id: 'TR-001', title: 'Advanced React Development', field: 'Engineering', priority: 'High' as const, status: 'Pending' as const, requestedBy: 'Dr. Khalid', semester: 'S1-2026' },
  { id: 'TR-002', title: 'Sales Negotiation Skills', field: 'Sales', priority: 'Medium' as const, status: 'Approved' as const, requestedBy: 'Ms. Fatima', semester: 'S1-2026' },
  { id: 'TR-003', title: 'Data Analytics Fundamentals', field: 'Operations', priority: 'Low' as const, status: 'Rejected' as const, requestedBy: 'Mr. Ali', semester: 'S2-2026' },
  { id: 'TR-004', title: 'Leadership & Team Management', field: 'HR', priority: 'High' as const, status: 'Pending' as const, requestedBy: 'Ms. Rania', semester: 'S1-2026' },
];

export const evaluationCriteria = [
  { id: 'c1', name: 'Attendance Compliance', type: 'binary' as const, description: 'Employee maintains ≥95% attendance' },
  { id: 'c2', name: 'Target Achievement', type: 'threshold' as const, description: 'Percentage of quarterly targets met' },
  { id: 'c3', name: 'Quality of Work', type: 'direct' as const, description: 'Overall quality assessment percentage' },
  { id: 'c4', name: 'Certification Status', type: 'choice' as const, description: 'Professional certification level' },
  { id: 'c5', name: 'Teamwork & Collaboration', type: 'scale' as const, description: 'Rating of team collaboration skills' },
];

export const branchMonthlyData = months.map((month) => ({
  month,
  Headquarters: Math.round(75 + Math.random() * 20),
  'North Branch': Math.round(70 + Math.random() * 20),
  'South Branch': Math.round(72 + Math.random() * 20),
  'East Branch': Math.round(68 + Math.random() * 20),
  'West Branch': Math.round(80 + Math.random() * 15),
}));
