import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'react-feather';
import {
	Loader2,
	ArrowUpRight,
	ArrowRightCircle,
	Database,
	ShieldCheck,
	Cloud,
	Server,
	BarChart3,
	Check,
	X,
	Link2,
	PenLine,
	SlidersHorizontal,
	Rocket,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/auth-context';
import {
	MAX_AGENT_QUERY_LENGTH,
	SUPPORTED_IMAGE_MIME_TYPES,
	type BehaviorType,
	type ProjectType,
} from '@/api-types';
import { useFeature } from '@/features';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { usePaginatedApps } from '@/hooks/use-paginated-apps';
import { AppCard } from '@/components/shared/AppCard';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useDragDrop } from '@/hooks/use-drag-drop';
import { toast } from 'sonner';
import { useLimitsContext } from '@/contexts/limits-context';
import { checkCanSendPrompt } from '@/utils/usage-limit-checker';
import { PromptBox } from '@/components/prompt-box';
import {
	ProjectModeSelector,
	type ProjectModeOption,
} from '@/components/project-mode-selector';
import { BehaviorModeToggle } from '@/components/behavior-mode-toggle';
import dashboardStrip from '@/assets/home/dashboard-strip.png';

const buildCards = [
	{
		title: 'Apps',
		description:
			'Turn operational needs into working internal apps with auth, workflow logic, and hosting already handled.',
		cta: 'Build an app',
	},
	{
		title: 'Portals',
		description:
			'Create role-specific views for finance, warehouse, or sales without cloning ERP data into another stack.',
		cta: 'Build a portal',
	},
	{
		title: 'AI agents',
		description:
			'Create agents that work on top of your systems, take action safely, and stay inside architectural boundaries.',
		cta: 'Create an AI agent',
	},
];

const designFeatures = [
	{
		title: 'Seamlessly collaborate',
		description:
			'See every page at once, leave notes, sketch ideas, and send instructions straight back into the build loop.',
	},
	{
		title: 'Generate role-specific tools',
		description:
			'Describe a finance dashboard, warehouse tracker, or support console and keep refining until it feels production-ready.',
	},
	{
		title: 'Get redesign recommendations',
		description:
			'Explore multiple layout directions before touching the real surface, so design changes feel deliberate.',
	},
	{
		title: 'Control the system',
		description:
			'Push tone, spacing, and UI rules across the whole app from one place without turning the page into a toy.',
	},
];

const growthCards = [
	{
		title: 'Live ERP dashboards',
		description:
			'Pull stock, invoice, and operations data live through the bridge so the ERP remains the source of truth.',
	},
	{
		title: 'Stakeholder portals',
		description:
			'Give teams or non-seat users the exact surfaces they need without dumping them into the full ERP interface.',
	},
	{
		title: 'Trust-first analytics',
		description:
			'Measure usage and business actions while staying explicit about where data is fetched, cached, or not stored.',
	},
];

const bridgePoints = [
	{
		title: 'One consistent interface',
		description:
			'Every app calls the same pull/push abstraction. The Bridge decides how data flows, per deployment — not per prompt.',
	},
	{
		title: 'AI code never touches the ERP',
		description:
			'Generated code only talks to the Bridge. It can never reach your ERP directly or persist data on its own.',
	},
	{
		title: 'Credentials stay encrypted',
		description:
			'The only thing we ever store is the encrypted API key needed to make the call — never the business data itself.',
	},
];

const deploymentModes = [
	{
		icon: <Cloud className="h-5 w-5" />,
		title: 'Without Data',
		badge: 'Default',
		description:
			'Pure pull-and-push. No ERP data is ever persisted by ERPeos. Every screen fetches live and forgets.',
		points: [
			'No business records stored',
			'Live pull / push only',
			'Encrypted credentials only',
		],
	},
	{
		icon: <Server className="h-5 w-5" />,
		title: 'Self-Host',
		badge: 'Enterprise',
		description:
			'The Bridge points to a database inside your own infrastructure. Same apps, same interface — only the destination changes.',
		points: [
			'Data lives in your environment',
			'Factory floors & restricted networks',
			'No architectural rewrite',
		],
	},
	{
		icon: <BarChart3 className="h-5 w-5" />,
		title: 'Seamless',
		badge: 'Managed',
		description:
			'For the deepest analytics — historical trends and cross-module joins. One isolated store per tenant, earned not defaulted.',
		points: [
			'Per-tenant physical isolation',
			'Static + AI security review',
			'Full audit logging',
		],
	},
];

const connectors = [
	{ name: 'Odoo', status: 'available' as const },
	{ name: 'NetSuite', status: 'planned' as const },
	{ name: 'SAP', status: 'planned' as const },
	{ name: 'Salesforce', status: 'planned' as const },
];

const processSteps = [
	{
		icon: <Link2 className="h-5 w-5" />,
		title: 'Connect your ERP',
		description:
			'One-click connection to Odoo, NetSuite, SAP, or Salesforce. Live read and write — your ERP stays the source of truth.',
	},
	{
		icon: <PenLine className="h-5 w-5" />,
		title: 'Describe what you need',
		description:
			'Write a prompt in plain language. ERPeos reads your modules, fields, and relationships before writing a single line of code.',
	},
	{
		icon: <SlidersHorizontal className="h-5 w-5" />,
		title: 'Customize and refine',
		description:
			'Iterate on the generated app until it feels right. Preview every change before it ships. No dev tickets, no waiting.',
	},
	{
		icon: <Rocket className="h-5 w-5" />,
		title: 'Publish to production',
		description:
			'One-click deploy with auth, permissions, and custom domains. Real apps your team uses every day.',
	},
];

const useCaseCategories = [
	{ id: 'inventory', label: 'Inventory', emoji: '📦' },
	{ id: 'hr', label: 'HR & Employees', emoji: '👤' },
	{ id: 'finance', label: 'Finance', emoji: '💰' },
	{ id: 'portals', label: 'Portals', emoji: '🌐' },
];

const useCases = [
	{
		category: 'inventory',
		emoji: '📊',
		title: 'Stock Dashboard',
		description:
			'Warehouse teams get a clean UI for stock status — KPIs, filters, and quick actions for adjustments.',
		erp: 'Odoo',
	},
	{
		category: 'inventory',
		emoji: '🔄',
		title: 'Inventory Transfers',
		description:
			'Track and initiate stock transfers between warehouses with real-time updates and approval workflows.',
		erp: 'Odoo',
	},
	{
		category: 'inventory',
		emoji: '⚠️',
		title: 'Reorder Alerts',
		description:
			'Automated low-stock alerts with suggested reorder quantities based on historical sales velocity.',
		erp: 'Odoo',
	},
	{
		category: 'hr',
		emoji: '🕐',
		title: 'Attendance Kiosk',
		description:
			'Mobile or shared kiosk for employees to clock in and out, synced to your ERP attendance module.',
		erp: 'Odoo',
	},
	{
		category: 'hr',
		emoji: '🏖️',
		title: 'Time Off Management',
		description:
			'Request and approve leave with balance tracking, team calendars, and automatic accruals.',
		erp: 'Odoo',
	},
	{
		category: 'hr',
		emoji: '📋',
		title: 'Employee Directory',
		description:
			'Searchable staff directory with roles and departments — without full ERP seats for everyone.',
		erp: 'Odoo',
	},
	{
		category: 'finance',
		emoji: '💳',
		title: 'Invoice Approval Portal',
		description:
			'Approve or reject invoices with line-item details, vendor history, and budget tracking.',
		erp: 'Odoo',
	},
	{
		category: 'finance',
		emoji: '📈',
		title: 'Revenue Dashboard',
		description:
			'Real-time revenue by product, region, or customer — pulled live from your ERP, never stored.',
		erp: 'Odoo',
	},
	{
		category: 'finance',
		emoji: '🧾',
		title: 'Expense Tracker',
		description:
			'Submit, track, and approve expenses with receipt uploads and multi-currency support.',
		erp: 'Odoo',
	},
	{
		category: 'portals',
		emoji: '👥',
		title: 'Customer Portal',
		description:
			'Let customers manage orders, invoices, and support tickets without touching the full ERP.',
		erp: 'Odoo',
	},
	{
		category: 'portals',
		emoji: '🤝',
		title: 'Vendor Portal',
		description:
			'Suppliers view purchase orders, submit invoices, and track payments — all through the Bridge.',
		erp: 'Odoo',
	},
	{
		category: 'portals',
		emoji: '🏢',
		title: 'Stakeholder Dashboard',
		description:
			'Give non-seat users the exact metrics they need — without dumping them into the ERP interface.',
		erp: 'Odoo',
	},
];

const integrations = [
	{ name: 'Odoo', available: true },
	{ name: 'NetSuite', available: false },
	{ name: 'Salesforce', available: false },
	{ name: 'SAP', available: false },
	{ name: 'Slack', available: true },
	{ name: 'Stripe', available: true },
	{ name: 'Shopify', available: true },
	{ name: 'Google Sheets', available: true },
	{ name: 'Gmail', available: true },
	{ name: 'n8n', available: true },
	{ name: 'HubSpot', available: true },
	{ name: 'GitHub', available: true },
];

const comparisonRows: {
	feature: string;
	erpeos: 'yes' | 'partial' | 'no';
	helloleo: 'yes' | 'partial' | 'no';
	generic: 'yes' | 'partial' | 'no';
}[] = [
	{
		feature: 'Knows your ERP data model',
		erpeos: 'yes',
		helloleo: 'yes',
		generic: 'no',
	},
	{
		feature: 'Data stays in your ERP (no copy)',
		erpeos: 'yes',
		helloleo: 'no',
		generic: 'no',
	},
	{
		feature: 'AI code isolated from ERP',
		erpeos: 'yes',
		helloleo: 'no',
		generic: 'no',
	},
	{
		feature: 'Self-host option',
		erpeos: 'yes',
		helloleo: 'no',
		generic: 'no',
	},
	{
		feature: 'One-click deploy',
		erpeos: 'yes',
		helloleo: 'yes',
		generic: 'no',
	},
	{
		feature: 'Trust by architecture',
		erpeos: 'yes',
		helloleo: 'no',
		generic: 'no',
	},
	{
		feature: 'No coding required',
		erpeos: 'yes',
		helloleo: 'yes',
		generic: 'no',
	},
	{
		feature: 'Multi-ERP support',
		erpeos: 'partial',
		helloleo: 'partial',
		generic: 'no',
	},
];

const faqs = [
	{
		q: 'What is ERPeos?',
		a: 'ERPeos is an AI-native app builder for ERP systems. You describe what you need in plain language, and ERPeos generates production-ready apps, portals, and dashboards that connect directly to your ERP — without ever storing a copy of your business data.',
	},
	{
		q: 'Do you store my business data?',
		a: 'No. By default, ERPeos never persists your business data. Every screen fetches live from your ERP through the Bridge, renders, and forgets. The only thing we store is the encrypted credential needed to make the call.',
	},
	{
		q: 'How is ERPeos different from HelloLeo or Retool?',
		a: 'Most app builders eventually become a second copy of your sensitive data. ERPeos is built so that AI-generated code architecturally cannot reach your ERP directly — it only talks to the Bridge. Security is a property of the architecture, not a promise in a privacy policy.',
	},
	{
		q: 'Is it safe to use with production ERP data?',
		a: 'Yes. No AI-generated code ever reaches your ERP directly. The Bridge enforces the same scopes your ERP credential already has — an app can never see more than the API key allows.',
	},
	{
		q: 'What can I build with ERPeos?',
		a: 'Internal apps, role-specific portals, live dashboards, and AI agents. Inventory trackers, HR portals, finance approval flows, customer portals — anything your team has been waiting for the ERP to show them clearly.',
	},
	{
		q: 'Which ERPs are supported?',
		a: 'Odoo is available today. NetSuite, SAP, and Salesforce are planned. The Bridge abstraction means the same apps work across all of them — only the destination changes.',
	},
];

const testimonials = [
	{
		quote: 'We built a stock dashboard for our warehouse team in an afternoon. The fact that ERPeos never holds a copy of our inventory data made the security review trivial — there was nothing to audit.',
		name: 'Sreekumar K.',
		role: 'ERP Engineer',
		company: 'Trans Maldivian Airways',
		apps: '3 apps',
		period: '6 days',
	},
	{
		quote: 'Shipped 30+ internal apps on top of Odoo — BOM management, tax analysis, profit reporting. ERPeos understands our data model instantly. The Bridge means I never worry about a bad prompt touching production.',
		name: 'Chris P.',
		role: 'IT Manager',
		company: 'Aardvark Tactical',
		apps: '30+ apps',
		period: 'ongoing',
	},
	{
		quote: 'We build Odoo applications for consulting clients. ERPeos lets us ship client portals in a fraction of the time. The trust story — no data at rest — closes deals that stalled with other vendors.',
		name: 'E. Mejia',
		role: 'CEO',
		company: 'Midorick Solutions',
		apps: '10+ portals',
		period: 'per month',
	},
	{
		quote: 'Our factory floor has restricted connectivity. Self-host mode let us say yes to a customer we would have lost with any other tool. Same apps, same Bridge — just deployed inside their network.',
		name: 'David L.',
		role: 'Solutions Architect',
		company: 'Industrial Systems Co.',
		apps: '12 apps',
		period: '3 months',
	},
];

export default function Home() {
	const navigate = useNavigate();
	const { requireAuth } = useAuthGuard();
	const [projectMode, setProjectMode] = useState<ProjectType>('app');
	const [behaviorMode, setBehaviorMode] =
		useState<Extract<BehaviorType, 'think' | 'phasic'>>('think');
	const [query, setQuery] = useState('');
	const { user } = useAuth();
	const { isLoadingCapabilities, capabilities, getEnabledFeatures } =
		useFeature();
	const { data: limitsData, loading: usageLimitsLoading } =
		useLimitsContext();
	const [showLimitDialog, setShowLimitDialog] =
		useState<React.ReactElement | null>(null);
	const [activeUseCase, setActiveUseCase] = useState('inventory');

	const handleConnectCloudflare = useCallback(() => {
		window.location.href = `/oauth/login?return_url=${encodeURIComponent(window.location.href)}`;
	}, []);

	const modeOptions = useMemo<ProjectModeOption[]>(() => {
		if (isLoadingCapabilities || !capabilities) return [];
		return getEnabledFeatures().map((def) => ({
			id: def.id,
			label:
				def.id === 'presentation'
					? 'Slides'
					: def.id === 'general'
						? 'General'
						: 'App',
			description: def.description,
		}));
	}, [capabilities, getEnabledFeatures, isLoadingCapabilities]);

	const showModeSelector = modeOptions.length > 1;

	useEffect(() => {
		if (isLoadingCapabilities) return;
		if (modeOptions.length === 0) {
			if (projectMode !== 'app') setProjectMode('app');
			return;
		}
		if (!modeOptions.some((mode) => mode.id === projectMode)) {
			setProjectMode(modeOptions[0].id);
		}
	}, [isLoadingCapabilities, modeOptions, projectMode]);

	const { images, addImages, removeImage, clearImages, isProcessing } =
		useImageUpload({
			onError: (error) => {
				console.error('Image upload error:', error);
				toast.error(error);
			},
		});

	const { isDragging, dragHandlers } = useDragDrop({
		onFilesDropped: addImages,
		accept: [...SUPPORTED_IMAGE_MIME_TYPES],
	});

	const placeholderPhrases = useMemo(
		() => [
			'warehouse dashboard on top of Odoo',
			'finance portal without storing ERP data',
			'sales operations workspace for non-seat users',
		],
		[],
	);

	const { apps, loading } = usePaginatedApps({
		type: 'public',
		defaultSort: 'popular',
		defaultPeriod: 'week',
		limit: 6,
	});

	const discoverReady = useMemo(
		() => !loading && (apps?.length ?? 0) > 5,
		[loading, apps],
	);

	const handleCreateApp = (nextQuery: string, mode: ProjectType) => {
		if (nextQuery.length > MAX_AGENT_QUERY_LENGTH) {
			toast.error(
				`Prompt too large (${nextQuery.length} characters). Maximum allowed is ${MAX_AGENT_QUERY_LENGTH} characters.`,
			);
			return;
		}

		if (user && usageLimitsLoading) return;

		const encodedQuery = encodeURIComponent(nextQuery);
		const encodedMode = encodeURIComponent(mode);
		const behaviorParam =
			mode === 'app'
				? `&behaviorType=${encodeURIComponent(behaviorMode)}`
				: '';
		const imageParam =
			images.length > 0
				? `&images=${encodeURIComponent(JSON.stringify(images))}`
				: '';
		const intendedUrl = `/chat/new?query=${encodedQuery}&projectType=${encodedMode}${behaviorParam}${imageParam}`;

		if (
			!requireAuth({
				requireFullAuth: true,
				actionContext: 'to create applications',
				intendedUrl,
			})
		) {
			return;
		}

		const limitCheck = checkCanSendPrompt(
			limitsData,
			usageLimitsLoading,
			() => {
				window.location.href = `/oauth/login?return_url=${encodeURIComponent(window.location.href)}`;
			},
			() => setShowLimitDialog(null),
		);

		if (!limitCheck.canProceed) {
			setShowLimitDialog(limitCheck.dialogComponent || null);
			return;
		}

		navigate(intendedUrl, { state: { fromPrompt: true } });
		clearImages();
	};

	return (
		<div className="relative min-h-full overflow-x-clip bg-[#f5f1ea] text-[#1d1b24]">
			<div className="base44-dot-bg pointer-events-none absolute inset-0 opacity-90" />
			<div className="base44-page-noise pointer-events-none absolute inset-0" />

			<div className="relative z-10">
				<section className="mx-auto max-w-[1280px] px-6 pb-0 pt-28 lg:px-10">
					<div className="mx-auto flex max-w-[1100px] flex-col items-center px-2 text-center sm:px-4">
						<h1 className="max-w-[980px] text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.045em] text-[#1d1b24] sm:text-[3.5rem] xl:text-[4rem]">
							Build anything on top of your ERP
						</h1>
						<p className="mt-5 max-w-[680px] px-2 text-[16px] leading-[1.55] text-[#1d1b24]/78 sm:px-0 sm:text-[17px]">
							The AI app builder that never stores a copy of your
							business data. Build apps, portals, and dashboards
							in minutes — your ERP stays the source of truth.
						</p>

						<div className="mt-7 w-full max-w-[640px] px-1 sm:px-0">
							<PromptBox
								value={query}
								onChange={setQuery}
								onSubmit={() =>
									handleCreateApp(query, projectMode)
								}
								placeholder="Create a "
								animatedPlaceholder
								placeholderPhrases={placeholderPhrases}
								images={images}
								onAddImages={addImages}
								onRemoveImage={removeImage}
								isProcessing={
									isProcessing ||
									(user ? usageLimitsLoading : false)
								}
								isDragging={isDragging}
								dragHandlers={dragHandlers}
								submitDisabled={
									user ? usageLimitsLoading : false
								}
								limitsData={user ? limitsData : undefined}
								onConnectCloudflare={handleConnectCloudflare}
								variant="landing"
								submitIcon={
									user && usageLimitsLoading ? (
										<Loader2 className="animate-spin" />
									) : (
										<ArrowRight />
									)
								}
								leftActions={
									showModeSelector ||
									projectMode === 'app' ? (
										<div className="flex flex-wrap items-center gap-2">
											{showModeSelector && (
												<ProjectModeSelector
													value={projectMode}
													onChange={setProjectMode}
													modes={modeOptions}
													className="flex-1"
												/>
											)}
											{projectMode === 'app' && (
												<BehaviorModeToggle
													value={behaviorMode}
													onChange={setBehaviorMode}
												/>
											)}
										</div>
									) : undefined
								}
							/>
						</div>

						<div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-3 text-[14px] font-medium text-[#1d1b24]/56 sm:px-0">
							<span>Odoo</span>
							<span className="text-[#1d1b24]/20">·</span>
							<span>NetSuite</span>
							<span className="text-[#1d1b24]/20">·</span>
							<span>Salesforce</span>
							<span className="text-[#1d1b24]/20">·</span>
							<span>SAP</span>
						</div>
					</div>

					<div className="dashboard-slider-shell mt-12">
						<div className="dashboard-slider-track">
							{Array.from({ length: 2 }, (_, index) => (
								<img
									key={index}
									src={dashboardStrip}
									alt="Dashboard UI cards"
									className="dashboard-slider-image"
								/>
							))}
						</div>
					</div>
				</section>

				<section className="pt-16">
					<div className="erpeos-section-warm">
						<div className="mx-auto max-w-[1280px] px-6 lg:px-10">
							<div className="mx-auto max-w-[1100px]">
								<p className="text-[14px] font-medium text-[#1d1b24]/68">
									From idea to production
								</p>
								<h2 className="mt-2 text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-[#1d1b24] sm:text-[2.25rem]">
									Ship in minutes, not months
								</h2>
								<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
									{processSteps.map((step, i) => (
										<div
											key={step.title}
											className="erpeos-card-hover flex flex-col bg-[#f8f6f2] p-5"
										>
											<div className="flex items-center gap-3">
												<div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#1d1b24]/12 text-[#1d1b24]/70">
													{step.icon}
												</div>
												<span className="text-[12px] font-bold text-[#1d1b24]/25">
													0{i + 1}
												</span>
											</div>
											<h3 className="mt-3 text-[15px] font-semibold text-[#1d1b24]">
												{step.title}
											</h3>
											<p className="mt-1.5 text-[13px] leading-[1.5] text-[#1d1b24]/68">
												{step.description}
											</p>
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="pt-16">
					<div className="erpeos-section-warm">
						<div className="mx-auto max-w-[1280px] px-6 lg:px-10">
							<div className="mx-auto max-w-[1100px]">
								<h2 className="text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[#1d1b24] sm:text-[2.75rem]">
									What will you build?
								</h2>
								<p className="mt-3 max-w-[600px] pr-2 text-[16px] leading-[1.55] text-[#1d1b24]/78">
									Apps, portals, dashboards, and AI agents —
									all connected to your ERP, all built in
									plain language.
								</p>
								<div className="mt-8 grid gap-5 lg:grid-cols-3">
									{buildCards.map((card) => (
										<div
											key={card.title}
											className="base44-category-card erpeos-card-hover"
										>
											<div>
												<h3 className="text-[1.75rem] font-semibold leading-[1.05] tracking-[-0.035em] text-[#1d1b24]">
													{card.title}
												</h3>
											</div>
											<div className="mt-auto">
												<p className="max-w-[26rem] pr-1 text-[15px] leading-[1.55] text-[#1d1b24]/82">
													{card.description}
												</p>
												<button
													type="button"
													onClick={() => {
														const hero =
															document.getElementById(
																'home-ai-box',
															);
														hero?.scrollIntoView({
															behavior: 'smooth',
															block: 'center',
														});
													}}
													className="mt-6 inline-flex items-center rounded-[12px] bg-[#2b282f] px-5 py-2.5 text-[15px] font-semibold text-white"
												>
													{card.cta}
												</button>
											</div>
											<div className="base44-category-accent" />
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="pt-16">
					<div className="erpeos-section-cream">
						<div className="mx-auto max-w-[1280px] px-6 lg:px-10">
							<div className="mx-auto max-w-[1100px]">
								<p className="text-[14px] font-medium text-[#1d1b24]/68">
									Use cases
								</p>
								<h2 className="mt-2 text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-[#1d1b24] sm:text-[2.25rem]">
									The internal apps your team has been waiting
									for
								</h2>
								<div className="mt-6 flex flex-wrap gap-2">
									{useCaseCategories.map((cat) => {
										const isActive =
											activeUseCase === cat.id;
										return (
											<button
												key={cat.id}
												type="button"
												onClick={() =>
													setActiveUseCase(cat.id)
												}
												className={
													isActive
														? 'inline-flex items-center gap-1.5 rounded-full bg-[#1d1b24] px-4 py-1.5 text-[14px] font-medium text-white'
														: 'inline-flex items-center gap-1.5 rounded-full bg-[#1d1b24]/6 px-4 py-1.5 text-[14px] font-medium text-[#1d1b24]/60 hover:bg-[#1d1b24]/10'
												}
											>
												<span>{cat.emoji}</span>
												{cat.label}
											</button>
										);
									})}
								</div>
								<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
									{useCases
										.filter(
											(uc) =>
												uc.category === activeUseCase,
										)
										.map((uc) => (
											<div
												key={uc.title}
												className="erpeos-card-hover flex flex-col bg-[#f8f6f2] p-5"
											>
												<div className="flex items-center gap-2">
													<span className="text-[24px]">
														{uc.emoji}
													</span>
													<span className="rounded-full bg-[#1d1b24]/6 px-2 py-0.5 text-[11px] font-medium text-[#1d1b24]/50">
														{uc.erp}
													</span>
												</div>
												<h3 className="mt-3 text-[15px] font-semibold text-[#1d1b24]">
													{uc.title}
												</h3>
												<p className="mt-1.5 text-[13px] leading-[1.5] text-[#1d1b24]/68">
													{uc.description}
												</p>
											</div>
										))}
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="pt-16">
					<div className="mx-auto max-w-[1440px] px-6 lg:px-10">
						<div className="grid min-h-[460px] lg:grid-cols-[1.02fr_1fr]">
							<div className="base44-blue-panel">
								<h2 className="max-w-[8ch] text-[2.25rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[2.75rem]">
									Beautiful by default. Yours by design.
								</h2>
								<p className="mt-5 max-w-[26rem] pr-2 text-[16px] leading-[1.55] text-white/88">
									ERPeos starts with surfaces that feel strong
									before you change a thing, and still hold up
									when you adapt them to your workflows.
								</p>
							</div>
							<div className="base44-feature-panel">
								{designFeatures.map((feature) => (
									<div
										key={feature.title}
										className="base44-feature-row"
									>
										<div>
											<h3 className="pr-3 text-[1.5rem] font-semibold leading-[1.1] tracking-[-0.03em] text-[#1d1b24]">
												{feature.title}
											</h3>
											<p className="mt-2 max-w-[34rem] pr-3 text-[15px] leading-[1.55] text-[#1d1b24]/78">
												{feature.description}
											</p>
										</div>
										<div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#1d1b24] text-[#1d1b24]">
											<ArrowRightCircle className="h-5 w-5 stroke-[2.3]" />
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</section>

				<section className="mx-auto max-w-[1280px] px-6 pt-16 lg:px-10">
					<div className="mx-auto grid max-w-[1100px] gap-8 lg:grid-cols-2 lg:items-center">
						<div>
							<div className="flex items-center gap-2 text-[14px] font-medium text-[#1d1b24]/68">
								<Database className="h-4 w-4" />
								The ERP Data Bridge
							</div>
							<h2 className="mt-2 text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-[#1d1b24] sm:text-[2.25rem]">
								Your ERP stays the source of truth
							</h2>
							<p className="mt-4 max-w-[32rem] text-[16px] leading-[1.55] text-[#1d1b24]/78">
								No AI-generated code ever reaches your ERP
								directly. Every app talks to one consistent
								interface — the Bridge — and the Bridge decides
								how data flows. Per deployment, per tenant,
								never per prompt.
							</p>
							<div className="mt-6 space-y-4">
								{bridgePoints.map((point) => (
									<div
										key={point.title}
										className="flex gap-3"
									>
										<div className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#1d1b24]/6">
											<Check className="h-3.5 w-3.5 text-[#1d1b24]" />
										</div>
										<div>
											<p className="text-[15px] font-semibold text-[#1d1b24]">
												{point.title}
											</p>
											<p className="mt-0.5 text-[14px] leading-[1.5] text-[#1d1b24]/68">
												{point.description}
											</p>
										</div>
									</div>
								))}
							</div>
						</div>
						<div className="base44-bridge-card">
							<div className="base44-bridge-code-header">
								<span>bridge.ts</span>
							</div>
							<div className="base44-bridge-code-body">
								<pre>{`// Every app calls one interface
const dataProvider = bridge.connect(tenant)

// Pull live — never persisted
await dataProvider.pull("stock_levels", filters)

// Push back — through the same wall
await dataProvider.push("sales_order", payload)`}</pre>
							</div>
						</div>
					</div>
					<div className="mx-auto mt-10 flex max-w-[1100px] flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#1d1b24]/8 pt-6">
						<span className="text-[13px] font-medium text-[#1d1b24]/50">
							Works with
						</span>
						{connectors.map((c) => {
							const isAvailable = c.status === 'available';
							return (
								<div
									key={c.name}
									className="flex items-center gap-1.5"
								>
									<span className="text-[15px] font-semibold text-[#1d1b24]">
										{c.name}
									</span>
									<span
										className={
											isAvailable
												? 'rounded-full bg-[#28c840]/12 px-1.5 py-0.5 text-[11px] font-medium text-[#1a8c2e]'
												: 'rounded-full bg-[#1d1b24]/6 px-1.5 py-0.5 text-[11px] font-medium text-[#1d1b24]/50'
										}
									>
										{isAvailable ? 'Available' : 'Planned'}
									</span>
								</div>
							);
						})}
					</div>
				</section>

				<section className="pt-16">
					<div className="erpeos-section-cool">
						<div className="mx-auto max-w-[1280px] px-6 lg:px-10">
							<div className="mx-auto max-w-[1100px]">
								<h2 className="text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-[#1d1b24] sm:text-[2.25rem]">
									Three ways to deploy. One foundation.
								</h2>
								<p className="mt-3 max-w-[600px] text-[16px] leading-[1.55] text-[#1d1b24]/78">
									Start without data, extend to self-host, or
									go seamless. Same generated apps, same
									Bridge — only the destination changes.
								</p>
								<div className="mt-8 grid gap-5 lg:grid-cols-3">
									{deploymentModes.map((mode) => {
										const isDefault =
											mode.badge === 'Default';
										const badgeClass = isDefault
											? 'rounded-full bg-[#ff670d]/12 px-2.5 py-0.5 text-[12px] font-medium text-[#ff670d]'
											: 'rounded-full bg-[#1d1b24]/6 px-2.5 py-0.5 text-[12px] font-medium text-[#1d1b24]/50';
										return (
											<div
												key={mode.title}
												className="erpeos-card-hover flex flex-col bg-[#f8f6f2] p-6"
											>
												<div className="flex items-center justify-between">
													<div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#1d1b24]/12 text-[#1d1b24]/70">
														{mode.icon}
													</div>
													<span
														className={badgeClass}
													>
														{mode.badge}
													</span>
												</div>
												<h3 className="mt-4 text-[1.25rem] font-semibold tracking-[-0.02em] text-[#1d1b24]">
													{mode.title}
												</h3>
												<p className="mt-2 text-[14px] leading-[1.55] text-[#1d1b24]/72">
													{mode.description}
												</p>
												<ul className="mt-auto space-y-2 pt-5">
													{mode.points.map(
														(point) => (
															<li
																key={point}
																className="flex items-center gap-2 text-[13px] text-[#1d1b24]/60"
															>
																<Check className="h-3.5 w-3.5 flex-none text-[#28c840]" />
																{point}
															</li>
														),
													)}
												</ul>
											</div>
										);
									})}
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="pt-16">
					<div className="erpeos-section-cool">
						<div className="mx-auto max-w-[1280px] px-6 lg:px-10">
							<div className="mx-auto max-w-[1100px]">
								<p className="text-[14px] font-medium text-[#1d1b24]/68">
									Integrations
								</p>
								<h2 className="mt-2 text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-[#1d1b24] sm:text-[2.25rem]">
									Connected to the tools your team already
									uses
								</h2>
								<p className="mt-3 max-w-[600px] text-[16px] leading-[1.55] text-[#1d1b24]/78">
									Your apps read from your existing stack and
									write back to your ERP. No middleware to
									build.
								</p>
							</div>
						</div>
						<div className="mt-8 erpeos-marquee-shell">
							<div className="erpeos-marquee-track">
								{[...integrations, ...integrations].map(
									(int, i) => (
										<div
											key={i}
											className="erpeos-marquee-logo"
										>
											<span className="text-[15px] font-semibold text-[#1d1b24]">
												{int.name}
											</span>
											<span
												className={
													int.available
														? 'text-[11px] font-medium text-[#1a8c2e]'
														: 'text-[11px] font-medium text-[#1d1b24]/40'
												}
											>
												{int.available
													? 'Available'
													: 'Planned'}
											</span>
										</div>
									),
								)}
							</div>
						</div>
					</div>
				</section>

				<section className="pt-16">
					<div className="erpeos-section-dark">
						<div className="mx-auto max-w-[1280px] px-6 lg:px-10">
							<div className="mx-auto max-w-[1100px]">
								<p className="text-[14px] font-medium text-white/50">
									Why ERPeos
								</p>
								<h2 className="mt-2 text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-white sm:text-[2.25rem]">
									Not just another AI app builder
								</h2>
								<p className="mt-3 max-w-[600px] text-[16px] leading-[1.55] text-white/72">
									Most app builders become a second copy of
									your sensitive data. ERPeos is built so that
									can’t happen.
								</p>
								<div className="mt-8 overflow-x-auto">
									<table className="w-full border-collapse">
										<thead>
											<tr>
												<th className="p-4 text-left text-[14px] font-semibold text-white">
													Feature
												</th>
												<th className="p-4 text-center text-[14px] font-semibold text-[#ff6b2c]">
													ERPeos
												</th>
												<th className="p-4 text-center text-[14px] font-medium text-white/50">
													HelloLeo
												</th>
												<th className="p-4 text-center text-[14px] font-medium text-white/50">
													Generic AI
												</th>
											</tr>
										</thead>
										<tbody>
											{comparisonRows.map((row) => (
												<tr
													key={row.feature}
													className="border-t border-white/8"
												>
													<td className="p-4 text-[14px] text-white/82">
														{row.feature}
													</td>
													<td className="p-4 text-center">
														{row.erpeos ===
														'yes' ? (
															<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#28c840]/16">
																<Check className="h-4 w-4 text-[#3ddc58]" />
															</span>
														) : row.erpeos ===
														  'partial' ? (
															<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#ff670d]/16 text-[12px] font-bold text-[#ff6b2c]">
																~
															</span>
														) : (
															<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/6">
																<X className="h-4 w-4 text-white/40" />
															</span>
														)}
													</td>
													<td className="p-4 text-center">
														{row.helloleo ===
														'yes' ? (
															<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#28c840]/16">
																<Check className="h-4 w-4 text-[#3ddc58]" />
															</span>
														) : row.helloleo ===
														  'partial' ? (
															<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#ff670d]/16 text-[12px] font-bold text-[#ff6b2c]">
																~
															</span>
														) : (
															<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/6">
																<X className="h-4 w-4 text-white/40" />
															</span>
														)}
													</td>
													<td className="p-4 text-center">
														{row.generic ===
														'yes' ? (
															<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#28c840]/16">
																<Check className="h-4 w-4 text-[#3ddc58]" />
															</span>
														) : row.generic ===
														  'partial' ? (
															<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#ff670d]/16 text-[12px] font-bold text-[#ff6b2c]">
																~
															</span>
														) : (
															<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/6">
																<X className="h-4 w-4 text-white/40" />
															</span>
														)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="pt-16">
					<div className="base44-textured-section">
						<div className="mx-auto max-w-[1280px] px-6 lg:px-10">
							<div className="mx-auto max-w-[1100px]">
								<p className="px-1 text-[14px] text-[#1d1b24]/68">
									Built-in tools to grow after you ship
								</p>
								<h2 className="mt-2 max-w-[760px] px-1 text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.035em] text-[#1d1b24] sm:text-[2rem]">
									ERPeos does not stop when you publish your
									internal tool. It keeps the trust model and
									still gives each team sharper operational
									surfaces.
								</h2>
								<div className="mt-8 grid gap-5 lg:grid-cols-3">
									{growthCards.map((card) => (
										<div
											key={card.title}
											className="base44-growth-card"
										>
											<h3 className="max-w-[9ch] pr-3 text-[1.5rem] font-semibold leading-[1.1] tracking-[-0.03em] text-[#1d1b24]">
												{card.title}
											</h3>
											<div className="mt-auto">
												<p className="max-w-[24rem] pr-2 text-[15px] leading-[1.55] text-[#1d1b24]/82">
													{card.description}
												</p>
												<div className="mt-6 flex h-10 w-10 items-center justify-center rounded-full bg-[#1d1b24] text-white">
													<ArrowUpRight className="h-4 w-4" />
												</div>
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="pt-16">
					<div className="base44-trust-section">
						<div className="mx-auto max-w-[1280px] px-6 lg:px-10">
							<div className="mx-auto max-w-[820px] text-center">
								<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/20 text-white/90">
									<ShieldCheck className="h-7 w-7" />
								</div>
								<h2 className="mt-6 text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-[2.75rem]">
									There is no database to secure.
								</h2>
								<p className="mt-4 text-[16px] leading-[1.55] text-white/72">
									For most use cases, there is no data at rest
									to ask about. Security is not a promise in a
									privacy policy — it is a property of how the
									system is built. Even a mistake in
									AI-generated code cannot leak data across
									tenants or persist something it should not.
								</p>
								<div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px] text-white/56">
									<span>Encrypted credentials only</span>
									<span className="text-white/20">·</span>
									<span>Per-tenant isolation</span>
									<span className="text-white/20">·</span>
									<span>Full audit logging</span>
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="mx-auto max-w-[1280px] px-6 pt-16 lg:px-10">
					<div className="mx-auto max-w-[1100px] rounded-[20px] bg-[#1d1b24] px-8 py-12 text-center sm:px-12 sm:py-14">
						<h2 className="mx-auto max-w-[680px] text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-white sm:text-[2.5rem]">
							Stop explaining your vision to developers
						</h2>
						<p className="mx-auto mt-4 max-w-[520px] text-[16px] leading-[1.55] text-white/72">
							You know your business better than anyone. Build the
							tools it needs in minutes — without giving anyone a
							copy of your data.
						</p>
						<button
							type="button"
							onClick={() => {
								const hero =
									document.getElementById('home-ai-box');
								hero?.scrollIntoView({
									behavior: 'smooth',
									block: 'center',
								});
							}}
							className="mt-7 inline-flex items-center gap-2 rounded-[12px] bg-[#ff6b2c] px-7 py-3 text-[16px] font-semibold text-white shadow-[0_10px_22px_rgba(255,107,44,0.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_26px_rgba(255,107,44,0.34)]"
						>
							Start building
							<ArrowRight className="h-5 w-5" />
						</button>
					</div>
				</section>

				<section className="pt-16">
					<div className="mx-auto max-w-[1280px] px-6 lg:px-10">
						<div className="mx-auto max-w-[1100px]">
							<p className="text-[14px] font-medium text-[#1d1b24]/68">
								Companies love working with ERPeos
							</p>
							<h2 className="mt-2 text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-[#1d1b24] sm:text-[2.25rem]">
								From startups to enterprises, teams trust ERPeos
							</h2>
						</div>
					</div>
					<div className="mt-8 erpeos-marquee-shell">
						<div className="erpeos-marquee-track">
							{[...testimonials, ...testimonials].map((t, i) => (
								<div key={i} className="erpeos-marquee-card">
									<p className="text-[14px] leading-[1.55] text-[#1d1b24]/82">
										{t.quote}
									</p>
									<div className="mt-4 flex items-center justify-between">
										<div>
											<p className="text-[14px] font-semibold text-[#1d1b24]">
												{t.name}
											</p>
											<p className="text-[13px] text-[#1d1b24]/60">
												{t.role} · {t.company}
											</p>
										</div>
										<div className="text-right">
											<p className="text-[13px] font-semibold text-[#ff670d]">
												{t.apps}
											</p>
											<p className="text-[12px] text-[#1d1b24]/50">
												{t.period}
											</p>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</section>

				{discoverReady && (
					<section className="mx-auto max-w-[1280px] px-6 pb-16 pt-16 lg:px-10">
						<div className="mx-auto max-w-[1100px]">
							<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
								<div>
									<p className="text-[14px] text-[#1d1b24]/68">
										Community builds
									</p>
									<h2 className="mt-1.5 text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.035em] text-[#1d1b24] sm:text-[2rem]">
										See what people are already shipping
									</h2>
								</div>
								<button
									type="button"
									onClick={() => navigate('/discover')}
									className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#1d1b24]/72"
								>
									View all
									<ArrowUpRight className="h-4 w-4" />
								</button>
							</div>
							<div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
								{apps.map((app) => (
									<AppCard
										key={app.id}
										app={app}
										onClick={() =>
											navigate(`/app/${app.id}`)
										}
										showStats={true}
										showUser={true}
										showActions={false}
									/>
								))}
							</div>
						</div>
					</section>
				)}
				<section className="pt-16">
					<div className="erpeos-section-warm">
						<div className="mx-auto max-w-[1280px] px-6 pb-16 lg:px-10">
							<div className="mx-auto max-w-[820px]">
								<h2 className="text-center text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-[#1d1b24] sm:text-[2.25rem]">
									Frequently Asked Questions
								</h2>
								<div className="mt-8 space-y-3">
									{faqs.map((faq) => (
										<details
											key={faq.q}
											className="group bg-[#f8f6f2] p-5"
										>
											<summary className="flex cursor-pointer items-center justify-between text-[15px] font-semibold text-[#1d1b24] marker:content-none">
												{faq.q}
												<span className="text-[#1d1b24]/40 transition-transform group-open:rotate-45">
													+
												</span>
											</summary>
											<p className="mt-3 text-[14px] leading-[1.55] text-[#1d1b24]/68">
												{faq.a}
											</p>
										</details>
									))}
								</div>
							</div>
						</div>
					</div>
				</section>
			</div>

			<div id="home-ai-box" className="absolute top-[14rem]" />
			{showLimitDialog}
		</div>
	);
}
