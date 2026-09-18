import { lazy, type LazyExoticComponent, type ComponentType } from 'react'

// Every tool here gets its own crawlable URL.
//
// Before this, all ~200 features lived behind hash fragments on "/" (#starmap,
// #tracker, …). Search engines treat those as one page, so none of the tools
// could ever rank for what they actually do. Each entry below is a real route
// with its own title, description and H1.

export interface ToolDef {
  slug: string
  title: string          // <title> / H1
  blurb: string          // meta description + on-page intro
  /** Tab to fall back to when someone wants the full dashboard context. */
  tab: string
  component: LazyExoticComponent<ComponentType<Record<string, never>>>
}

const c = (loader: () => Promise<{ default: ComponentType<never> }>) =>
  lazy(loader as () => Promise<{ default: ComponentType<Record<string, never>> }>)

export const TOOLS: ToolDef[] = [
  {
    slug: 'star-map',
    title: 'Interactive Star Map — Live Night Sky Above You',
    blurb: 'A live, interactive map of the stars and constellations visible from your exact location right now. Set your city, pick a time, and see what is really overhead.',
    tab: '#starmap',
    component: c(() => import('../components/StarMap')),
  },
  {
    slug: 'tonights-sky',
    title: "Tonight's Sky — What You Can See From Your Location",
    blurb: 'Everything visible tonight from where you are: planets, bright stars, the Moon, and the best hours to look. Updated continuously.',
    tab: '#starmap',
    component: c(() => import('../components/TonightsSky')),
  },
  {
    slug: 'iss-tracker',
    title: 'Live ISS Tracker — Where Is the Space Station Right Now',
    blurb: 'Track the International Space Station live on a world map, with its current altitude, speed and ground position updated every second.',
    tab: '#tracker',
    component: c(() => import('../components/ISSTracker')),
  },
  {
    slug: 'iss-pass-predictor',
    title: 'ISS Pass Predictor — When the Space Station Flies Over You',
    blurb: 'Find out exactly when the ISS will be visible from your location, how high it will climb, and which direction to look.',
    tab: '#tracker',
    component: c(() => import('../components/ISSPassPredictor')),
  },
  {
    slug: 'moon-phase',
    title: 'Moon Phase Tonight — Current Illumination & Moonrise',
    blurb: "Tonight's Moon phase, illumination percentage, age in days, and moonrise and moonset times for your location.",
    tab: '#events',
    component: c(() => import('../components/MoonPhase')),
  },
  {
    slug: 'meteor-showers',
    title: 'Meteor Shower Calendar — Peak Dates & Hourly Rates',
    blurb: 'Every major meteor shower of the year with peak nights, expected hourly rates, radiant position and Moon interference.',
    tab: '#events',
    component: c(() => import('../components/MeteorShowers')),
  },
  {
    slug: 'solar-system-3d',
    title: '3D Solar System Simulator — Live Planet Positions',
    blurb: 'An interactive 3D model of the solar system showing where every planet actually is right now, with orbits to scale.',
    tab: '#solar',
    component: c(() => import('../components/SolarSystem3D')),
  },
  {
    slug: 'planet-visibility',
    title: 'Planet Visibility Calendar — Which Planets Are Visible Tonight',
    blurb: 'See which planets are above the horizon tonight, when they rise and set, and how bright each one will be.',
    tab: '#solar',
    component: c(() => import('../components/PlanetVisibilityCalendar')),
  },
  {
    slug: 'planet-explorer',
    title: 'Planet Explorer — Facts, Size and Conditions',
    blurb: 'Explore every planet in the solar system: size, gravity, atmosphere, temperature, moons and orbital data.',
    tab: '#solar',
    component: c(() => import('../components/PlanetExplorer')),
  },
  {
    slug: 'satellite-tracker',
    title: 'Live Satellite Tracker — Starlink, Hubble and More',
    blurb: 'Track satellites in real time, including Starlink trains, Hubble and weather satellites, with live orbital positions.',
    tab: '#tracker',
    component: c(() => import('../components/SatelliteTracker')),
  },
  {
    slug: 'aurora-forecast',
    title: 'Aurora Forecast — Northern Lights Visibility Tonight',
    blurb: 'Live aurora forecast with the current Kp index, the visibility boundary, and whether the northern lights could reach your latitude tonight.',
    tab: '#weather',
    component: c(() => import('../components/AuroraForecast')),
  },
  {
    slug: 'space-weather',
    title: 'Space Weather — Solar Flares, Wind and Geomagnetic Storms',
    blurb: 'Live space weather from NOAA: solar flare activity, solar wind speed, geomagnetic storm levels and their effects on Earth.',
    tab: '#weather',
    component: c(() => import('../components/SpaceWeather')),
  },
  {
    slug: 'light-pollution',
    title: 'Light Pollution Map — How Dark Is Your Sky',
    blurb: 'Check the light pollution level and Bortle class at your location, and see how many stars you can realistically expect to see.',
    tab: '#observe',
    component: c(() => import('../components/LightPollutionMeter')),
  },
  {
    slug: 'seeing-forecast',
    title: 'Astronomy Seeing Forecast — Best Nights to Observe',
    blurb: 'Atmospheric seeing, transparency and cloud forecast for the coming nights, so you know when it is worth setting up the telescope.',
    tab: '#observe',
    component: c(() => import('../components/SeeingForecast')),
  },
  {
    slug: 'telescope-advisor',
    title: 'Telescope Advisor — Find the Right Telescope for You',
    blurb: 'Answer a few questions about your budget, targets and experience, and get a telescope recommendation that actually fits.',
    tab: '#observe',
    component: c(() => import('../components/TelescopeAdvisor')),
  },
  {
    slug: 'astrophotography-planner',
    title: 'Astrophotography Planner — Plan Your Next Deep Sky Shot',
    blurb: 'Plan astrophotography sessions: target altitude through the night, Moon interference, exposure guidance and framing.',
    tab: '#observe',
    component: c(() => import('../components/AstroPhotoPlanner')),
  },
  {
    slug: 'observation-log',
    title: 'Observation Log — Your Personal Astronomy Journal',
    blurb: 'Record what you observed, with what equipment and under what conditions. Export to CSV, and sync it to your account.',
    tab: '#observe',
    component: c(() => import('../components/ObservationLog')),
  },
  {
    slug: 'night-sky-calendar',
    title: 'Night Sky Calendar — Astronomy Events This Month',
    blurb: 'Every notable sky event this month: conjunctions, oppositions, eclipses, meteor peaks and Moon phases.',
    tab: '#events',
    component: c(() => import('../components/NightSkyCalendar')),
  },
  {
    slug: 'eclipse-countdown',
    title: 'Eclipse Countdown — Next Solar and Lunar Eclipses',
    blurb: 'Countdown to the next solar and lunar eclipses, with visibility paths and what you will see from your region.',
    tab: '#events',
    component: c(() => import('../components/EclipseCountdown')),
  },
  {
    slug: 'constellation-guide',
    title: 'Constellation Guide — All 88 Constellations',
    blurb: 'Learn all 88 constellations: star patterns, mythology, brightest stars and the best season to spot each one.',
    tab: '#starmap',
    component: c(() => import('../components/ConstellationGuide')),
  },
  {
    slug: 'deep-sky-browser',
    title: 'Deep Sky Object Browser — Messier and NGC Catalogue',
    blurb: 'Browse galaxies, nebulae and star clusters with magnitude, size and the equipment needed to actually see each one.',
    tab: '#observe',
    component: c(() => import('../components/DeepSkyBrowser')),
  },
  {
    slug: 'exoplanet-explorer',
    title: 'Exoplanet Explorer — Real Planets Around Other Stars',
    blurb: 'Explore confirmed exoplanets from NASA data: size, orbit, host star, distance and habitable-zone status.',
    tab: '#science',
    component: c(() => import('../components/ExoplanetExplorer')),
  },
  {
    slug: 'asteroid-tracker',
    title: 'Near-Earth Asteroid Tracker — Close Approaches',
    blurb: 'Live NASA data on asteroids passing near Earth: size, speed, miss distance and whether any are worth worrying about.',
    tab: '#tracker',
    component: c(() => import('../components/AsteroidTracker')),
  },
  {
    slug: 'mars-weather',
    title: 'Mars Weather — Live Conditions on the Red Planet',
    blurb: 'Current weather on Mars from rover data: temperature, pressure, wind and the length of the current sol.',
    tab: '#weather',
    component: c(() => import('../components/MarsWeather')),
  },
  {
    slug: 'nasa-apod',
    title: 'NASA Astronomy Picture of the Day',
    blurb: "Today's NASA Astronomy Picture of the Day in full resolution, with the official explanation.",
    tab: '#gallery',
    component: c(() => import('../components/NasaAPOD')),
  },
  {
    slug: 'jwst-gallery',
    title: 'James Webb Telescope Gallery — Latest JWST Images',
    blurb: 'The most striking images from the James Webb Space Telescope, with what each one shows and why it matters.',
    tab: '#gallery',
    component: c(() => import('../components/JWSTGallery')),
  },
  {
    slug: 'astro-calculator',
    title: 'Astronomy Calculator — Magnification, FOV and Exit Pupil',
    blurb: 'Work out magnification, true field of view, exit pupil and focal ratio for any telescope and eyepiece combination.',
    tab: '#observe',
    component: c(() => import('../components/AstroCalculator')),
  },
  {
    slug: 'space-quiz',
    title: 'Space Quiz — Test Your Astronomy Knowledge',
    blurb: 'A quick astronomy quiz covering planets, stars, missions and deep space. See how much you actually know.',
    tab: '#quiz',
    component: c(() => import('../components/SpaceQuiz')),
  },
]

export const TOOL_BY_SLUG = new Map(TOOLS.map(t => [t.slug, t]))
