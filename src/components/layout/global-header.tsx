import { useEffect, useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { AuthButton } from '../auth/auth-button';
import { ThemeToggle } from '../theme-toggle';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { ChevronRight, AlertCircle } from 'lucide-react';
import { CloudflareLogo } from '../icons/logos';
import { usePlatformStatus } from '@/hooks/use-platform-status';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLocation } from 'react-router';
import clsx from 'clsx';
import { UsageLimitsBadge } from '../usage-limits-badge';
import { Button } from '../ui/button';

const landingLinks = ['Product', 'Use Cases', 'Resources', 'Pricing', 'Enterprise'];

export function GlobalHeader() {
	const { user } = useAuth();
	const { status } = usePlatformStatus();
	const [isChangelogOpen, setIsChangelogOpen] = useState(false);
	const hasMaintenanceMessage = Boolean(status.hasActiveMessage && status.globalUserMessage.trim().length > 0);
	const hasChangeLogs = Boolean(status.changeLogs && status.changeLogs.trim().length > 0);
	const { pathname } = useLocation();

	useEffect(() => {
		if (!hasChangeLogs) {
			setIsChangelogOpen(false);
		}
	}, [hasChangeLogs]);

	return (
		<Dialog open={isChangelogOpen} onOpenChange={setIsChangelogOpen}>
			<motion.header
				initial={{ y: -10, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				transition={{ duration: 0.2, ease: 'easeOut' }}
				className={clsx('sticky top-0 z-50', pathname === '/' ? 'bg-transparent' : 'bg-bg-3')}
			>
				<div className="relative">
					<div className="absolute inset-0 z-0" />

					<div
						className={clsx(
							'relative z-10',
							pathname === '/'
								? 'mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8'
								: 'grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-2',
						)}
					>
						{pathname === '/' ? (
							<>
								<div className="flex min-w-0 items-center gap-3">
									{user && (
										<motion.div
											whileTap={{ scale: 0.95 }}
											transition={{ type: 'spring', stiffness: 400, damping: 17 }}
											className="flex items-center"
										>
											<SidebarTrigger className="mr-2 h-8 w-8 rounded-md text-text-primary transition-colors duration-200 hover:bg-orange-50/40" />
										</motion.div>
									)}
									<div className="flex items-center gap-2 text-[#1d1b24]">
										<CloudflareLogo
											className="h-7 w-auto flex-shrink-0"
											color1="#ff6b2c"
											color2="#ff9a4d"
										/>
										<span className="text-lg font-semibold tracking-[-0.04em]">ERPeos</span>
									</div>
								</div>

								<nav className="hidden items-center gap-7 text-sm text-[#1d1b24]/72 lg:flex">
									{landingLinks.map((link) => (
										<button
											key={link}
											type="button"
											className="transition-colors hover:text-[#1d1b24]"
										>
											{link}
										</button>
									))}
								</nav>

								<motion.div
									initial={{ opacity: 0, x: 10 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ delay: 0.2 }}
									className="flex flex-wrap items-center justify-end gap-2 sm:gap-3"
								>
									{user && (
										<UsageLimitsBadge
											onConnect={() => {
												const url = new URL('/oauth/login', window.location.origin);
												url.searchParams.set('return_url', window.location.pathname + window.location.search);
												window.location.href = url.toString();
											}}
										/>
									)}
									<ThemeToggle />
									<AuthButton />
									<Button
										type="button"
										size="sm"
										onClick={() => {
											window.scrollTo({ top: 220, behavior: 'smooth' });
										}}
										className="rounded-[10px] bg-[#1d1b24] px-4 text-white hover:bg-[#2a2832]"
									>
										Start building
									</Button>
								</motion.div>
							</>
						) : (
							<>
								{user ? (
									<motion.div
										whileTap={{ scale: 0.95 }}
										transition={{
											type: 'spring',
											stiffness: 400,
											damping: 17,
										}}
										className="flex items-center"
									>
										<SidebarTrigger className="h-8 w-8 rounded-md text-text-primary transition-colors duration-200 hover:bg-orange-50/40" />
										<CloudflareLogo
											className="mx-auto flex-shrink-0 transition-all duration-300"
											style={{
												width: '28px',
												height: '28px',
												marginLeft: '8px',
											}}
										/>
										{hasMaintenanceMessage && (
											<button
												type="button"
												onClick={hasChangeLogs ? () => setIsChangelogOpen(true) : undefined}
												disabled={!hasChangeLogs}
												className={`ml-4 flex max-w-full items-center gap-2 rounded-[10px] border border-accent/40 bg-bg-4/80 px-3 py-1.5 text-xs text-text-primary shadow-sm backdrop-blur transition-colors hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-accent/30 dark:bg-bg-2/80 md:text-sm${!hasChangeLogs ? ' opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
												aria-label="Platform updates"
											>
												<AlertCircle className="h-4 w-4 text-accent" />
												<span className="max-w-[46ch] truncate md:max-w-[60ch]">{status.globalUserMessage}</span>
												<ChevronRight className="ml-1 h-4 w-4 text-accent" />
											</button>
										)}
									</motion.div>
								) : (
									<div />
								)}

								<motion.div
									initial={{ opacity: 0, x: 10 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ delay: 0.2 }}
									className="flex flex-wrap items-center justify-end gap-3 justify-self-end"
								>
									{user && (
										<UsageLimitsBadge
											onConnect={() => {
												const url = new URL('/oauth/login', window.location.origin);
												url.searchParams.set('return_url', window.location.pathname + window.location.search);
												window.location.href = url.toString();
											}}
										/>
									)}
									<ThemeToggle />
									<AuthButton />
								</motion.div>
							</>
						)}
					</div>
				</div>
			</motion.header>
			{hasChangeLogs && (
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>Platform updates</DialogTitle>
						{status.globalUserMessage && (
							<DialogDescription className="text-sm text-muted-foreground">
								{status.globalUserMessage}
							</DialogDescription>
						)}
					</DialogHeader>
					<ScrollArea className="max-h-[60vh] pr-4">
						<p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
							{status.changeLogs}
						</p>
					</ScrollArea>
				</DialogContent>
			)}
		</Dialog>
	);
}
