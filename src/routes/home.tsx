import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'react-feather';
import { Loader2, ArrowUpRight, ArrowRightCircle } from 'lucide-react';
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
import { ProjectModeSelector, type ProjectModeOption } from '@/components/project-mode-selector';
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

export default function Home() {
	const navigate = useNavigate();
	const { requireAuth } = useAuthGuard();
	const [projectMode, setProjectMode] = useState<ProjectType>('app');
	const [behaviorMode, setBehaviorMode] = useState<Extract<BehaviorType, 'think' | 'phasic'>>('think');
	const [query, setQuery] = useState('');
	const { user } = useAuth();
	const { isLoadingCapabilities, capabilities, getEnabledFeatures } = useFeature();
	const { data: limitsData, loading: usageLimitsLoading } = useLimitsContext();
	const [showLimitDialog, setShowLimitDialog] = useState<React.ReactElement | null>(null);

	const handleConnectCloudflare = useCallback(() => {
		window.location.href = `/oauth/login?return_url=${encodeURIComponent(window.location.href)}`;
	}, []);

	const modeOptions = useMemo<ProjectModeOption[]>(() => {
		if (isLoadingCapabilities || !capabilities) return [];
		return getEnabledFeatures().map((def) => ({
			id: def.id,
			label: def.id === 'presentation' ? 'Slides' : def.id === 'general' ? 'General' : 'App',
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

	const { images, addImages, removeImage, clearImages, isProcessing } = useImageUpload({
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

	const discoverReady = useMemo(() => !loading && (apps?.length ?? 0) > 5, [loading, apps]);

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
		const behaviorParam = mode === 'app' ? `&behaviorType=${encodeURIComponent(behaviorMode)}` : '';
		const imageParam = images.length > 0 ? `&images=${encodeURIComponent(JSON.stringify(images))}` : '';
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
				<section className="mx-auto max-w-[1720px] px-6 pb-0 pt-10 lg:px-10">
					<div className="mx-auto flex max-w-[1460px] flex-col items-center px-4 text-center sm:px-6">
						<h1 className="max-w-[1380px] text-[4.5rem] font-semibold leading-[0.92] tracking-[-0.085em] text-[#1d1b24] sm:text-[6.1rem] xl:text-[7.55rem]">
							Every ERP team needs a base
						</h1>
						<p className="mt-8 max-w-[860px] px-3 text-[19px] leading-[1.5] text-[#1d1b24]/78 sm:px-0 sm:text-[20px]">
							Build apps, portals, dashboards, and AI agents on top of your ERP using your own words. Move fast without creating another risky copy of your business data.
						</p>

						<div className="mt-9 w-full max-w-[730px] px-2 sm:px-0">
							<PromptBox
								value={query}
								onChange={setQuery}
								onSubmit={() => handleCreateApp(query, projectMode)}
								placeholder="Create a "
								animatedPlaceholder
								placeholderPhrases={placeholderPhrases}
								images={images}
								onAddImages={addImages}
								onRemoveImage={removeImage}
								isProcessing={isProcessing || (user ? usageLimitsLoading : false)}
								isDragging={isDragging}
								dragHandlers={dragHandlers}
								submitDisabled={user ? usageLimitsLoading : false}
								limitsData={user ? limitsData : undefined}
								onConnectCloudflare={handleConnectCloudflare}
								variant="landing"
								submitIcon={user && usageLimitsLoading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
								leftActions={
									showModeSelector || projectMode === 'app' ? (
										<div className="flex flex-wrap items-center gap-2.5">
											{showModeSelector && (
												<ProjectModeSelector
													value={projectMode}
													onChange={setProjectMode}
													modes={modeOptions}
													className="flex-1"
												/>
											)}
											{projectMode === 'app' && (
												<BehaviorModeToggle value={behaviorMode} onChange={setBehaviorMode} />
											)}
										</div>
									) : undefined
								}
							/>
						</div>

						<div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-3 text-[16px] text-[#1d1b24]/56 sm:px-0 sm:text-[17px]">
							<span>[Apps]</span>
							<span>Portals</span>
							<span>Dashboards</span>
							<span>Agents</span>
						</div>
					</div>

					<div className="dashboard-slider-shell mt-10">
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

				<section className="mx-auto max-w-[1860px] px-0 pt-18">
					<div className="mx-auto max-w-[1680px] px-7 lg:px-8">
						<h2 className="text-[4.4rem] font-semibold leading-[0.94] tracking-[-0.075em] text-[#1d1b24]">
							What will you build?
						</h2>
						<p className="mt-5 max-w-[720px] pr-4 text-[19px] leading-[1.5] text-[#1d1b24]/78">
							Whatever you are imagining, you can use vibe coding to build it on ERPeos.
						</p>
					</div>
					<div className="mt-10 grid gap-6 lg:grid-cols-3">
						{buildCards.map((card) => (
							<div key={card.title} className="base44-category-card">
								<div>
									<h3 className="text-[3.45rem] font-semibold leading-[0.94] tracking-[-0.065em] text-[#1d1b24]">
										{card.title}
									</h3>
								</div>
								<div className="mt-auto">
									<p className="max-w-[28rem] pr-2 text-[17px] leading-[1.55] text-[#1d1b24]/82">
										{card.description}
									</p>
									<button
										type="button"
										onClick={() => {
											const hero = document.getElementById('home-ai-box');
											hero?.scrollIntoView({ behavior: 'smooth', block: 'center' });
										}}
										className="mt-10 inline-flex items-center rounded-[15px] bg-[#2b282f] px-7 py-4 text-[18px] font-semibold text-white"
									>
										{card.cta}
									</button>
								</div>
								<div className="base44-category-accent" />
							</div>
						))}
					</div>
				</section>

				<section className="mx-auto max-w-[1860px] px-0 pt-18">
					<div className="grid min-h-[760px] lg:grid-cols-[1.02fr_1fr]">
						<div className="base44-blue-panel">
								<h2 className="max-w-[8ch] text-[5.2rem] font-semibold leading-[0.92] tracking-[-0.08em] text-white">
									Beautiful by default. Yours by design.
								</h2>
								<p className="mt-8 max-w-[28rem] pr-3 text-[19px] leading-[1.5] text-white/88">
									ERPeos starts with surfaces that feel strong before you change a thing, and still hold up when you adapt them to your workflows.
								</p>
						</div>
						<div className="base44-feature-panel">
							{designFeatures.map((feature) => (
								<div key={feature.title} className="base44-feature-row">
									<div>
										<h3 className="pr-4 text-[3.25rem] font-semibold leading-[0.98] tracking-[-0.06em] text-[#1d1b24]">
											{feature.title}
										</h3>
										<p className="mt-4 max-w-[40rem] pr-4 text-[17px] leading-[1.55] text-[#1d1b24]/78">
											{feature.description}
										</p>
									</div>
									<div className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#1d1b24] text-[#1d1b24]">
										<ArrowRightCircle className="h-8 w-8 stroke-[2.3]" />
									</div>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="mx-auto max-w-[1860px] px-0 pt-18">
					<div className="base44-textured-section">
						<div className="mx-auto max-w-[1680px] px-7 lg:px-10">
							<p className="px-1 text-[16px] text-[#1d1b24]/68">Built-in tools to grow after you ship</p>
							<h2 className="mt-3 max-w-[920px] px-1 text-[3.2rem] font-semibold leading-[1] tracking-[-0.055em] text-[#1d1b24]">
								ERPeos does not stop when you publish your internal tool. It keeps the trust model and still gives each team sharper operational surfaces.
							</h2>
							<div className="mt-12 grid gap-6 lg:grid-cols-3">
								{growthCards.map((card) => (
									<div key={card.title} className="base44-growth-card">
										<h3 className="max-w-[9ch] pr-4 text-[2.55rem] font-semibold leading-[0.96] tracking-[-0.055em] text-[#1d1b24]">
											{card.title}
										</h3>
										<div className="mt-auto">
											<p className="max-w-[26rem] pr-3 text-[16px] leading-[1.55] text-[#1d1b24]/82">
												{card.description}
											</p>
											<div className="mt-10 flex h-12 w-12 items-center justify-center rounded-full bg-[#1d1b24] text-white">
												<ArrowUpRight className="h-5 w-5" />
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</section>

				{discoverReady && (
					<section className="mx-auto max-w-[1860px] px-7 pb-20 pt-18 lg:px-10">
						<div className="mx-auto max-w-[1680px]">
							<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
								<div>
									<p className="text-[16px] text-[#1d1b24]/68">Community builds</p>
									<h2 className="mt-2 text-[3rem] font-semibold leading-[1] tracking-[-0.055em] text-[#1d1b24]">
										See what people are already shipping
									</h2>
								</div>
								<button
									type="button"
									onClick={() => navigate('/discover')}
									className="inline-flex items-center gap-2 text-[18px] font-medium text-[#1d1b24]/72"
								>
									View all
									<ArrowUpRight className="h-5 w-5" />
								</button>
							</div>
							<div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
								{apps.map((app) => (
									<AppCard
										key={app.id}
										app={app}
										onClick={() => navigate(`/app/${app.id}`)}
										showStats={true}
										showUser={true}
										showActions={false}
									/>
								))}
							</div>
						</div>
					</section>
				)}
			</div>

			<div id="home-ai-box" className="absolute top-[18rem]" />
			{showLimitDialog}
		</div>
	);
}
