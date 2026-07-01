import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import ISSAlertSystem from '../components/ISSAlertSystem'

export const CITY_DATA: Record<string, { name: string; nameEn: string; lat: number; lng: number; desc: string }> = {
  'new-york':        { name: 'New York',        nameEn: 'New York',        lat: 40.71,  lng: -74.00,  desc: 'NYC — ISS is visible above the iconic skyline up to 5 times per day' },
  'london':          { name: 'London',          nameEn: 'London',          lat: 51.51,  lng: -0.13,   desc: 'London — High latitude means longer, more frequent ISS passes' },
  'los-angeles':     { name: 'Los Angeles',     nameEn: 'Los Angeles',     lat: 34.05,  lng: -118.24, desc: 'LA — Clear skies make ISS passes spectacular from the hills' },
  'paris':           { name: 'Paris',           nameEn: 'Paris',           lat: 48.86,  lng: 2.35,    desc: 'Paris — ISS can be seen passing near the Eiffel Tower' },
  'tokyo':           { name: 'Tokyo',           nameEn: 'Tokyo',           lat: 35.68,  lng: 139.65,  desc: 'Tokyo — ISS passes are a popular sight for Japanese astronomy fans' },
  'sydney':          { name: 'Sydney',          nameEn: 'Sydney',          lat: -33.87, lng: 151.21,  desc: 'Sydney — Southern hemisphere offers unique views of the night sky' },
  'toronto':         { name: 'Toronto',         nameEn: 'Toronto',         lat: 43.65,  lng: -79.38,  desc: 'Toronto — ISS passes are clearly visible from Lake Ontario shores' },
  'berlin':          { name: 'Berlin',          nameEn: 'Berlin',          lat: 52.52,  lng: 13.41,   desc: 'Berlin — High latitude city with excellent ISS visibility' },
  'dubai':           { name: 'Dubai',           nameEn: 'Dubai',           lat: 25.20,  lng: 55.27,   desc: 'Dubai — Clear desert skies make ISS very bright when passing overhead' },
  'chicago':         { name: 'Chicago',         nameEn: 'Chicago',         lat: 41.88,  lng: -87.63,  desc: 'Chicago — Lake Michigan provides a clear western horizon for ISS rises' },
  'tel-aviv':        { name: 'Tel Aviv',        nameEn: 'Tel Aviv',        lat: 32.08,  lng: 34.78,   desc: 'Tel Aviv — ISS passes over Israel 4-5 times daily' },
  'jerusalem':       { name: 'Jerusalem',       nameEn: 'Jerusalem',       lat: 31.77,  lng: 35.21,   desc: 'Jerusalem — Track ISS from the rooftops of the Old City' },
  'amsterdam':       { name: 'Amsterdam',       nameEn: 'Amsterdam',       lat: 52.37,  lng: 4.90,    desc: 'Amsterdam — Flat horizon makes ISS easily visible from the city' },
  'madrid':          { name: 'Madrid',          nameEn: 'Madrid',          lat: 40.42,  lng: -3.70,   desc: 'Madrid — Clear Spanish skies offer great ISS viewing conditions' },
  'rome':            { name: 'Rome',            nameEn: 'Rome',            lat: 41.90,  lng: 12.50,   desc: 'Rome — Watch ISS glide above the ancient city' },
  'moscow':          { name: 'Moscow',          nameEn: 'Moscow',          lat: 55.75,  lng: 37.62,   desc: 'Moscow — Very frequent ISS passes due to high latitude' },
  'beijing':         { name: 'Beijing',         nameEn: 'Beijing',         lat: 39.91,  lng: 116.39,  desc: 'Beijing — ISS visible from Tiananmen Square area on clear nights' },
  'singapore':       { name: 'Singapore',       nameEn: 'Singapore',       lat: 1.35,   lng: 103.82,  desc: 'Singapore — Equatorial location gives unique ISS viewing angles' },
  'mumbai':          { name: 'Mumbai',          nameEn: 'Mumbai',          lat: 19.08,  lng: 72.88,   desc: 'Mumbai — Arabian Sea horizon makes ISS rises dramatic' },
  'cairo':           { name: 'Cairo',           nameEn: 'Cairo',           lat: 30.04,  lng: 31.24,   desc: 'Cairo — Desert air clarity makes ISS exceptionally bright' },
  'mexico-city':     { name: 'Mexico City',     nameEn: 'Mexico City',     lat: 19.43,  lng: -99.13,  desc: 'Mexico City — High altitude location improves ISS visibility' },
  'buenos-aires':    { name: 'Buenos Aires',    nameEn: 'Buenos Aires',    lat: -34.60, lng: -58.38,  desc: 'Buenos Aires — Southern sky views make ISS passes unique' },
  'sao-paulo':       { name: 'São Paulo',       nameEn: 'Sao Paulo',       lat: -23.55, lng: -46.63,  desc: 'São Paulo — Brazil\'s largest city with frequent ISS passes' },
  'johannesburg':    { name: 'Johannesburg',    nameEn: 'Johannesburg',    lat: -26.20, lng: 28.04,   desc: 'Johannesburg — Southern Africa offers pristine dark sky views' },
  'seoul':           { name: 'Seoul',           nameEn: 'Seoul',           lat: 37.57,  lng: 126.98,  desc: 'Seoul — ISS frequently visible from Han River parks' },
  'bangkok':         { name: 'Bangkok',         nameEn: 'Bangkok',         lat: 13.75,  lng: 100.52,  desc: 'Bangkok — Tropical skies offer clear ISS sightings' },
  'istanbul':        { name: 'Istanbul',        nameEn: 'Istanbul',        lat: 41.01,  lng: 28.95,   desc: 'Istanbul — Watch ISS cross the Bosphorus from Europe to Asia' },
  'vienna':          { name: 'Vienna',          nameEn: 'Vienna',          lat: 48.21,  lng: 16.37,   desc: 'Vienna — Central Europe location with excellent ISS visibility' },
  'stockholm':       { name: 'Stockholm',       nameEn: 'Stockholm',       lat: 59.33,  lng: 18.07,   desc: 'Stockholm — Arctic proximity means ISS is visible in broad daylight sometimes' },
  'miami':           { name: 'Miami',           nameEn: 'Miami',           lat: 25.77,  lng: -80.19,  desc: 'Miami — Ocean horizon gives dramatic ISS rise and set views' },
  'houston':         { name: 'Houston',         nameEn: 'Houston',         lat: 29.76,  lng: -95.37,  desc: 'Houston — Home of NASA Mission Control, ISS passes are extra special here' },
  'san-francisco':   { name: 'San Francisco',   nameEn: 'San Francisco',   lat: 37.77,  lng: -122.42, desc: 'San Francisco — Golden Gate makes a stunning ISS backdrop' },
  'cape-town':       { name: 'Cape Town',       nameEn: 'Cape Town',       lat: -33.92, lng: 18.42,   desc: 'Cape Town — Table Mountain frames ISS passes beautifully' },
  'melbourne':       { name: 'Melbourne',       nameEn: 'Melbourne',       lat: -37.81, lng: 144.96,  desc: 'Melbourne — Southern hemisphere ISS passes often last longer' },
  'seattle':         { name: 'Seattle',         nameEn: 'Seattle',         lat: 47.61,  lng: -122.33, desc: 'Seattle — Pacific Northwest skies offer stunning ISS passes' },
  'barcelona':       { name: 'Barcelona',       nameEn: 'Barcelona',       lat: 41.39,  lng: 2.17,    desc: 'Barcelona — Mediterranean climate means clear ISS sighting nights' },
  'milan':           { name: 'Milan',           nameEn: 'Milan',           lat: 45.46,  lng: 9.19,    desc: 'Milan — Northern Italy location with frequent ISS overhead passes' },
  'lisbon':          { name: 'Lisbon',          nameEn: 'Lisbon',          lat: 38.72,  lng: -9.14,   desc: 'Lisbon — Atlantic coast views make ISS passes dramatic' },
  'prague':          { name: 'Prague',          nameEn: 'Prague',          lat: 50.08,  lng: 14.44,   desc: 'Prague — Central European position with excellent ISS visibility' },
  'warsaw':          { name: 'Warsaw',          nameEn: 'Warsaw',          lat: 52.23,  lng: 21.01,   desc: 'Warsaw — High latitude means very frequent ISS passes' },
  'lagos':           { name: 'Lagos',           nameEn: 'Lagos',           lat: 6.52,   lng: 3.38,    desc: 'Lagos — West Africa\'s largest city with near-equatorial ISS passes' },
  'nairobi':         { name: 'Nairobi',         nameEn: 'Nairobi',         lat: -1.29,  lng: 36.82,   desc: 'Nairobi — Equatorial location gives unique overhead ISS angles' },
  'lima':            { name: 'Lima',            nameEn: 'Lima',            lat: -12.05, lng: -77.04,  desc: 'Lima — Pacific coast of South America with clear ISS sightings' },
  'bogota':          { name: 'Bogotá',          nameEn: 'Bogota',          lat: 4.71,   lng: -74.07,  desc: 'Bogotá — High altitude Andean capital with pristine sky views' },
  'santiago':        { name: 'Santiago',        nameEn: 'Santiago',        lat: -33.46, lng: -70.65,  desc: 'Santiago — Andean backdrop makes ISS passes especially scenic' },
  'montreal':        { name: 'Montréal',        nameEn: 'Montreal',        lat: 45.50,  lng: -73.57,  desc: 'Montréal — Canadian winters produce spectacularly clear ISS nights' },
  'vancouver':       { name: 'Vancouver',       nameEn: 'Vancouver',       lat: 49.28,  lng: -123.12, desc: 'Vancouver — Pacific coast with mountain backdrop for ISS viewing' },
  'riyadh':          { name: 'Riyadh',          nameEn: 'Riyadh',          lat: 24.69,  lng: 46.72,   desc: 'Riyadh — Desert clarity makes ISS exceptionally bright overhead' },
  'shanghai':        { name: 'Shanghai',        nameEn: 'Shanghai',        lat: 31.23,  lng: 121.47,  desc: 'Shanghai — Yangtze delta city with frequent ISS orbital crossings' },
  'hong-kong':       { name: 'Hong Kong',       nameEn: 'Hong Kong',       lat: 22.32,  lng: 114.17,  desc: 'Hong Kong — Victoria Harbour frames ISS passes beautifully' },
  'jakarta':         { name: 'Jakarta',         nameEn: 'Jakarta',         lat: -6.21,  lng: 106.85,  desc: 'Jakarta — Equatorial position gives direct overhead ISS passes' },
  'kuala-lumpur':    { name: 'Kuala Lumpur',    nameEn: 'Kuala Lumpur',    lat: 3.14,   lng: 101.69,  desc: 'Kuala Lumpur — Tropical skies with direct-overhead ISS crossings' },
  'manila':          { name: 'Manila',          nameEn: 'Manila',          lat: 14.60,  lng: 120.98,  desc: 'Manila — Philippine archipelago with ocean-horizon ISS views' },
  'accra':           { name: 'Accra',           nameEn: 'Accra',           lat: 5.56,   lng: -0.20,   desc: 'Accra — Ghana\'s capital near the equator for near-overhead ISS passes' },
  'boston':          { name: 'Boston',          nameEn: 'Boston',          lat: 42.36,  lng: -71.06,  desc: 'Boston — Harbor views make ISS passes over New England dramatic' },
  'washington-dc':   { name: 'Washington DC',   nameEn: 'Washington DC',   lat: 38.91,  lng: -77.04,  desc: 'Washington DC — Watch the ISS glide over the National Mall' },
  'philadelphia':    { name: 'Philadelphia',    nameEn: 'Philadelphia',    lat: 39.95,  lng: -75.17,  desc: 'Philadelphia — ISS passes visible from the Delaware riverfront' },
  'atlanta':         { name: 'Atlanta',         nameEn: 'Atlanta',         lat: 33.75,  lng: -84.39,  desc: 'Atlanta — Southern skies offer frequent bright ISS passes' },
  'denver':          { name: 'Denver',          nameEn: 'Denver',          lat: 39.74,  lng: -104.99, desc: 'Denver — Mile-high altitude and dry air make the ISS extra crisp' },
  'phoenix':         { name: 'Phoenix',         nameEn: 'Phoenix',         lat: 33.45,  lng: -112.07, desc: 'Phoenix — Desert clarity delivers brilliant ISS sightings year-round' },
  'dallas':          { name: 'Dallas',          nameEn: 'Dallas',          lat: 32.78,  lng: -96.80,  desc: 'Dallas — Wide Texas horizons give long, full ISS passes' },
  'austin':          { name: 'Austin',          nameEn: 'Austin',          lat: 30.27,  lng: -97.74,  desc: 'Austin — Hill Country skies frame the ISS beautifully' },
  'houston-tx':      { name: 'Houston TX',      nameEn: 'Houston TX',      lat: 29.76,  lng: -95.37,  desc: 'Houston — Mission Control\'s hometown watches its own station fly over' },
  'san-diego':       { name: 'San Diego',       nameEn: 'San Diego',       lat: 32.72,  lng: -117.16, desc: 'San Diego — Pacific horizon makes ISS rises over the ocean stunning' },
  'las-vegas':       { name: 'Las Vegas',       nameEn: 'Las Vegas',       lat: 36.17,  lng: -115.14, desc: 'Las Vegas — Desert edges just outside the Strip offer bright ISS views' },
  'portland':        { name: 'Portland',        nameEn: 'Portland',        lat: 45.52,  lng: -122.68, desc: 'Portland — Summer clear spells bring excellent ISS visibility' },
  'minneapolis':     { name: 'Minneapolis',     nameEn: 'Minneapolis',     lat: 44.98,  lng: -93.27,  desc: 'Minneapolis — Northern latitude means frequent, long ISS passes' },
  'detroit':         { name: 'Detroit',         nameEn: 'Detroit',         lat: 42.33,  lng: -83.05,  desc: 'Detroit — Great Lakes horizons give clean ISS rise views' },
  'orlando':         { name: 'Orlando',         nameEn: 'Orlando',         lat: 28.54,  lng: -81.38,  desc: 'Orlando — Close to Kennedy Space Center, a true space-fan city' },
  'tampa':           { name: 'Tampa',           nameEn: 'Tampa',           lat: 27.95,  lng: -82.46,  desc: 'Tampa — Gulf coast sunsets flow straight into ISS viewing time' },
  'nashville':       { name: 'Nashville',       nameEn: 'Nashville',       lat: 36.16,  lng: -86.78,  desc: 'Nashville — Tennessee skies host 4-6 visible ISS passes weekly' },
  'new-orleans':     { name: 'New Orleans',     nameEn: 'New Orleans',     lat: 29.95,  lng: -90.07,  desc: 'New Orleans — Mississippi River views pair well with ISS passes' },
  'salt-lake-city':  { name: 'Salt Lake City',  nameEn: 'Salt Lake City',  lat: 40.76,  lng: -111.89, desc: 'Salt Lake City — Mountain air clarity makes the ISS brilliant' },
  'kansas-city':     { name: 'Kansas City',     nameEn: 'Kansas City',     lat: 39.10,  lng: -94.58,  desc: 'Kansas City — Flat plains horizons show full ISS passes end to end' },
  'st-louis':        { name: 'St. Louis',       nameEn: 'St Louis',        lat: 38.63,  lng: -90.20,  desc: 'St. Louis — Watch the ISS arc over the Gateway Arch' },
  'pittsburgh':      { name: 'Pittsburgh',      nameEn: 'Pittsburgh',      lat: 40.44,  lng: -79.99,  desc: 'Pittsburgh — River valleys and hilltops offer great ISS vantage points' },
  'cleveland':       { name: 'Cleveland',       nameEn: 'Cleveland',       lat: 41.50,  lng: -81.69,  desc: 'Cleveland — Lake Erie provides an unobstructed northern horizon' },
  'baltimore':       { name: 'Baltimore',       nameEn: 'Baltimore',       lat: 39.29,  lng: -76.61,  desc: 'Baltimore — Chesapeake views make ISS spotting easy' },
  'sacramento':      { name: 'Sacramento',      nameEn: 'Sacramento',      lat: 38.58,  lng: -121.49, desc: 'Sacramento — Central Valley clear nights are ideal for ISS watching' },
  'honolulu':        { name: 'Honolulu',        nameEn: 'Honolulu',        lat: 21.31,  lng: -157.86, desc: 'Honolulu — Mid-Pacific location with pristine ocean-horizon ISS views' },
  'anchorage':       { name: 'Anchorage',       nameEn: 'Anchorage',       lat: 61.22,  lng: -149.90, desc: 'Anchorage — High latitude brings ISS passes alongside auroras' },
  'charlotte':       { name: 'Charlotte',       nameEn: 'Charlotte',       lat: 35.23,  lng: -80.84,  desc: 'Charlotte — Carolina skies offer reliable evening ISS passes' },
  'columbus':        { name: 'Columbus',        nameEn: 'Columbus',        lat: 39.96,  lng: -83.00,  desc: 'Columbus — Ohio\'s capital sees the ISS several times daily' },
  'calgary':         { name: 'Calgary',         nameEn: 'Calgary',         lat: 51.05,  lng: -114.07, desc: 'Calgary — Rocky Mountain air and high latitude mean superb ISS passes' },
  'edmonton':        { name: 'Edmonton',        nameEn: 'Edmonton',        lat: 53.55,  lng: -113.49, desc: 'Edmonton — One of the best ISS-viewing latitudes in North America' },
  'ottawa':          { name: 'Ottawa',          nameEn: 'Ottawa',          lat: 45.42,  lng: -75.70,  desc: 'Ottawa — Canada\'s capital enjoys frequent long-duration ISS passes' },
  'winnipeg':        { name: 'Winnipeg',        nameEn: 'Winnipeg',        lat: 49.90,  lng: -97.14,  desc: 'Winnipeg — Prairie horizons show the ISS from rise to set' },
  'quebec-city':     { name: 'Québec City',     nameEn: 'Quebec City',     lat: 46.81,  lng: -71.21,  desc: 'Québec City — St. Lawrence views pair with crisp northern skies' },
  'halifax':         { name: 'Halifax',         nameEn: 'Halifax',         lat: 44.65,  lng: -63.58,  desc: 'Halifax — Atlantic horizon makes ISS rises over the ocean memorable' },
  'dublin':          { name: 'Dublin',          nameEn: 'Dublin',          lat: 53.35,  lng: -6.26,   desc: 'Dublin — Irish latitude delivers long summer twilight ISS passes' },
  'edinburgh':       { name: 'Edinburgh',       nameEn: 'Edinburgh',       lat: 55.95,  lng: -3.19,   desc: 'Edinburgh — Castle silhouettes under frequent high-latitude ISS passes' },
  'manchester':      { name: 'Manchester',      nameEn: 'Manchester',      lat: 53.48,  lng: -2.24,   desc: 'Manchester — Northern England sees the ISS several times nightly' },
  'birmingham':      { name: 'Birmingham',      nameEn: 'Birmingham',      lat: 52.49,  lng: -1.89,   desc: 'Birmingham — Central UK location with excellent ISS visibility' },
  'glasgow':         { name: 'Glasgow',         nameEn: 'Glasgow',         lat: 55.86,  lng: -4.25,   desc: 'Glasgow — Scotland\'s largest city catches long ISS arcs' },
  'brussels':        { name: 'Brussels',        nameEn: 'Brussels',        lat: 50.85,  lng: 4.35,    desc: 'Brussels — Heart of Europe with reliable ISS evening passes' },
  'zurich':          { name: 'Zurich',          nameEn: 'Zurich',          lat: 47.38,  lng: 8.54,    desc: 'Zurich — Alpine air clarity makes the ISS shine over the lake' },
  'geneva':          { name: 'Geneva',          nameEn: 'Geneva',          lat: 46.20,  lng: 6.14,    desc: 'Geneva — Watch the ISS cross above Lake Geneva and Mont Blanc' },
  'munich':          { name: 'Munich',          nameEn: 'Munich',          lat: 48.14,  lng: 11.58,   desc: 'Munich — Bavarian skies host the ISS almost every clear evening' },
  'frankfurt':       { name: 'Frankfurt',       nameEn: 'Frankfurt',       lat: 50.11,  lng: 8.68,    desc: 'Frankfurt — Skyline views of the ISS over the Main river' },
  'hamburg':         { name: 'Hamburg',         nameEn: 'Hamburg',         lat: 53.55,  lng: 9.99,    desc: 'Hamburg — Northern Germany\'s port city with frequent ISS passes' },
  'cologne':         { name: 'Cologne',         nameEn: 'Cologne',         lat: 50.94,  lng: 6.96,    desc: 'Cologne — The ISS regularly arcs above the famous cathedral' },
  'copenhagen':      { name: 'Copenhagen',      nameEn: 'Copenhagen',      lat: 55.68,  lng: 12.57,   desc: 'Copenhagen — Nordic latitude means abundant summer ISS sightings' },
  'oslo':            { name: 'Oslo',            nameEn: 'Oslo',            lat: 59.91,  lng: 10.75,   desc: 'Oslo — High latitude brings ISS passes together with auroras' },
  'helsinki':        { name: 'Helsinki',        nameEn: 'Helsinki',        lat: 60.17,  lng: 24.94,   desc: 'Helsinki — Baltic skies where ISS passes meet northern lights' },
  'reykjavik':       { name: 'Reykjavik',       nameEn: 'Reykjavik',       lat: 64.15,  lng: -21.94,  desc: 'Reykjavik — Aurora capital where the ISS joins the light show' },
  'athens':          { name: 'Athens',          nameEn: 'Athens',          lat: 37.98,  lng: 23.73,   desc: 'Athens — Watch the ISS pass over the Acropolis on clear nights' },
  'budapest':        { name: 'Budapest',        nameEn: 'Budapest',        lat: 47.50,  lng: 19.04,   desc: 'Budapest — Danube riverbanks make perfect ISS viewing spots' },
  'bucharest':       { name: 'Bucharest',       nameEn: 'Bucharest',       lat: 44.43,  lng: 26.10,   desc: 'Bucharest — Romania\'s capital sees bright ISS passes year-round' },
  'sofia':           { name: 'Sofia',           nameEn: 'Sofia',           lat: 42.70,  lng: 23.32,   desc: 'Sofia — Mountain backdrop of Vitosha frames ISS crossings' },
  'belgrade':        { name: 'Belgrade',        nameEn: 'Belgrade',        lat: 44.79,  lng: 20.45,   desc: 'Belgrade — Confluence views where the ISS crosses Balkan skies' },
  'zagreb':          { name: 'Zagreb',          nameEn: 'Zagreb',          lat: 45.81,  lng: 15.98,   desc: 'Zagreb — Croatia\'s capital with dependable evening ISS passes' },
  'krakow':          { name: 'Kraków',          nameEn: 'Krakow',          lat: 50.06,  lng: 19.94,   desc: 'Kraków — Historic old town under frequent ISS flyovers' },
  'porto':           { name: 'Porto',           nameEn: 'Porto',           lat: 41.15,  lng: -8.61,   desc: 'Porto — Atlantic coast of Portugal with dramatic ISS ocean rises' },
  'valencia':        { name: 'Valencia',        nameEn: 'Valencia',        lat: 39.47,  lng: -0.38,   desc: 'Valencia — Mediterranean clarity for bright ISS sightings' },
  'seville':         { name: 'Seville',         nameEn: 'Seville',         lat: 37.39,  lng: -5.99,   desc: 'Seville — Andalusian clear skies host brilliant ISS passes' },
  'naples':          { name: 'Naples',          nameEn: 'Naples',          lat: 40.85,  lng: 14.27,   desc: 'Naples — The ISS arcs over the bay and Mount Vesuvius' },
  'turin':           { name: 'Turin',           nameEn: 'Turin',           lat: 45.07,  lng: 7.69,    desc: 'Turin — Alps on the horizon as the ISS crosses northern Italy' },
  'florence':        { name: 'Florence',        nameEn: 'Florence',        lat: 43.77,  lng: 11.26,   desc: 'Florence — Renaissance rooftops under the space station\'s path' },
  'venice':          { name: 'Venice',          nameEn: 'Venice',          lat: 45.44,  lng: 12.32,   desc: 'Venice — Lagoon reflections double the beauty of ISS passes' },
  'nice':            { name: 'Nice',            nameEn: 'Nice',            lat: 43.71,  lng: 7.26,    desc: 'Nice — Côte d\'Azur clarity makes the ISS gleam over the sea' },
  'lyon':            { name: 'Lyon',            nameEn: 'Lyon',            lat: 45.76,  lng: 4.84,    desc: 'Lyon — Rhône valley skies with regular bright ISS crossings' },
  'marseille':       { name: 'Marseille',       nameEn: 'Marseille',       lat: 43.30,  lng: 5.37,    desc: 'Marseille — Mediterranean port with clear-sky ISS viewing' },
  'tallinn':         { name: 'Tallinn',         nameEn: 'Tallinn',         lat: 59.44,  lng: 24.75,   desc: 'Tallinn — Baltic high latitude means very frequent ISS passes' },
  'riga':            { name: 'Riga',            nameEn: 'Riga',            lat: 56.95,  lng: 24.11,   desc: 'Riga — Latvia\'s capital catches long, high ISS arcs' },
  'vilnius':         { name: 'Vilnius',         nameEn: 'Vilnius',         lat: 54.69,  lng: 25.28,   desc: 'Vilnius — Lithuanian skies with reliable station flyovers' },
  'kyiv':            { name: 'Kyiv',            nameEn: 'Kyiv',            lat: 50.45,  lng: 30.52,   desc: 'Kyiv — The ISS crosses above the Dnipro several times nightly' },
  'abu-dhabi':       { name: 'Abu Dhabi',       nameEn: 'Abu Dhabi',       lat: 24.45,  lng: 54.38,   desc: 'Abu Dhabi — Gulf desert air makes the ISS exceptionally bright' },
  'doha':            { name: 'Doha',            nameEn: 'Doha',            lat: 25.29,  lng: 51.53,   desc: 'Doha — Qatar\'s skyline under brilliant desert-sky ISS passes' },
  'kuwait-city':     { name: 'Kuwait City',     nameEn: 'Kuwait City',     lat: 29.38,  lng: 47.99,   desc: 'Kuwait City — Clear desert nights showcase the station overhead' },
  'amman':           { name: 'Amman',           nameEn: 'Amman',           lat: 31.95,  lng: 35.93,   desc: 'Amman — Jordan\'s hills give elevated views of ISS crossings' },
  'muscat':          { name: 'Muscat',          nameEn: 'Muscat',          lat: 23.59,  lng: 58.41,   desc: 'Muscat — Arabian Sea horizon meets pristine desert skies' },
  'haifa':           { name: 'Haifa',           nameEn: 'Haifa',           lat: 32.79,  lng: 34.99,   desc: 'Haifa — Mount Carmel offers sweeping views of ISS Mediterranean passes' },
  'eilat':           { name: 'Eilat',           nameEn: 'Eilat',           lat: 29.56,  lng: 34.95,   desc: 'Eilat — Desert darkness makes it Israel\'s best ISS viewing city' },
  'beer-sheva':      { name: 'Be\'er Sheva',    nameEn: 'Beer Sheva',      lat: 31.25,  lng: 34.79,   desc: 'Be\'er Sheva — Negev desert gateway with dark-sky ISS views' },
  'osaka':           { name: 'Osaka',           nameEn: 'Osaka',           lat: 34.69,  lng: 135.50,  desc: 'Osaka — Japan\'s kitchen watches the ISS over the bay' },
  'kyoto':           { name: 'Kyoto',           nameEn: 'Kyoto',           lat: 35.01,  lng: 135.77,  desc: 'Kyoto — Ancient temples beneath the modern station\'s path' },
  'nagoya':          { name: 'Nagoya',          nameEn: 'Nagoya',          lat: 35.18,  lng: 136.91,  desc: 'Nagoya — Central Japan location with regular ISS visibility' },
  'busan':           { name: 'Busan',           nameEn: 'Busan',           lat: 35.18,  lng: 129.08,  desc: 'Busan — Korean coast where the ISS rises over the sea' },
  'taipei':          { name: 'Taipei',          nameEn: 'Taipei',          lat: 25.03,  lng: 121.57,  desc: 'Taipei — Taiwan\'s capital catches bright subtropical ISS passes' },
  'shenzhen':        { name: 'Shenzhen',        nameEn: 'Shenzhen',        lat: 22.54,  lng: 114.06,  desc: 'Shenzhen — Tech capital under the station\'s southern China route' },
  'guangzhou':       { name: 'Guangzhou',       nameEn: 'Guangzhou',       lat: 23.13,  lng: 113.26,  desc: 'Guangzhou — Pearl River delta views of ISS crossings' },
  'chengdu':         { name: 'Chengdu',         nameEn: 'Chengdu',         lat: 30.57,  lng: 104.07,  desc: 'Chengdu — Sichuan basin skies host regular ISS flyovers' },
  'delhi':           { name: 'Delhi',           nameEn: 'Delhi',           lat: 28.61,  lng: 77.21,   desc: 'Delhi — India\'s capital sees the ISS pass 4-5 times daily' },
  'bangalore':       { name: 'Bangalore',       nameEn: 'Bangalore',       lat: 12.97,  lng: 77.59,   desc: 'Bangalore — India\'s space city, home of ISRO, watches the ISS' },
  'chennai':         { name: 'Chennai',         nameEn: 'Chennai',         lat: 13.08,  lng: 80.27,   desc: 'Chennai — Bay of Bengal horizon for dramatic ISS rises' },
  'kolkata':         { name: 'Kolkata',         nameEn: 'Kolkata',         lat: 22.57,  lng: 88.36,   desc: 'Kolkata — The ISS arcs over the Hooghly on clear nights' },
  'hyderabad':       { name: 'Hyderabad',       nameEn: 'Hyderabad',       lat: 17.39,  lng: 78.49,   desc: 'Hyderabad — Deccan plateau elevation aids ISS visibility' },
  'karachi':         { name: 'Karachi',         nameEn: 'Karachi',         lat: 24.86,  lng: 67.01,   desc: 'Karachi — Arabian Sea coast with clear-horizon ISS views' },
  'lahore':          { name: 'Lahore',          nameEn: 'Lahore',          lat: 31.55,  lng: 74.34,   desc: 'Lahore — Punjab skies host the station several times nightly' },
  'dhaka':           { name: 'Dhaka',           nameEn: 'Dhaka',           lat: 23.81,  lng: 90.41,   desc: 'Dhaka — Bangladesh\'s capital under frequent tropical ISS passes' },
  'colombo':         { name: 'Colombo',         nameEn: 'Colombo',         lat: 6.93,   lng: 79.85,   desc: 'Colombo — Near-equatorial Sri Lanka gets direct overhead passes' },
  'kathmandu':       { name: 'Kathmandu',       nameEn: 'Kathmandu',       lat: 27.72,  lng: 85.32,   desc: 'Kathmandu — Himalayan backdrop for unforgettable ISS crossings' },
  'hanoi':           { name: 'Hanoi',           nameEn: 'Hanoi',           lat: 21.03,  lng: 105.85,  desc: 'Hanoi — Vietnam\'s capital sees bright tropical ISS passes' },
  'ho-chi-minh-city': { name: 'Ho Chi Minh City', nameEn: 'Ho Chi Minh City', lat: 10.82, lng: 106.63, desc: 'Ho Chi Minh City — Near-equator location for overhead ISS paths' },
  'manila-ph':       { name: 'Manila PH',       nameEn: 'Manila PH',       lat: 14.60,  lng: 120.98,  desc: 'Manila — Island horizons give sweeping ISS ocean views' },
  'casablanca':      { name: 'Casablanca',      nameEn: 'Casablanca',      lat: 33.57,  lng: -7.59,   desc: 'Casablanca — Atlantic coast of Morocco with clear ISS sightings' },
  'marrakech':       { name: 'Marrakech',       nameEn: 'Marrakech',       lat: 31.63,  lng: -7.99,   desc: 'Marrakech — Desert-edge skies make the ISS brilliantly bright' },
  'tunis':           { name: 'Tunis',           nameEn: 'Tunis',           lat: 36.81,  lng: 10.18,   desc: 'Tunis — Mediterranean African coast with regular ISS passes' },
  'algiers':         { name: 'Algiers',         nameEn: 'Algiers',         lat: 36.75,  lng: 3.06,    desc: 'Algiers — North African clarity for bright station flyovers' },
  'addis-ababa':     { name: 'Addis Ababa',     nameEn: 'Addis Ababa',     lat: 9.03,   lng: 38.75,   desc: 'Addis Ababa — High-altitude Ethiopian capital with crisp skies' },
  'dar-es-salaam':   { name: 'Dar es Salaam',   nameEn: 'Dar es Salaam',   lat: -6.79,  lng: 39.21,   desc: 'Dar es Salaam — Indian Ocean horizon meets equatorial ISS paths' },
  'kampala':         { name: 'Kampala',         nameEn: 'Kampala',         lat: 0.35,   lng: 32.58,   desc: 'Kampala — On the equator itself: the ISS passes directly overhead' },
  'durban':          { name: 'Durban',          nameEn: 'Durban',          lat: -29.86, lng: 31.03,   desc: 'Durban — South African coast with warm-night ISS watching' },
  'abuja':           { name: 'Abuja',           nameEn: 'Abuja',           lat: 9.06,   lng: 7.49,    desc: 'Abuja — Nigeria\'s capital under near-equatorial station passes' },
  'brisbane':        { name: 'Brisbane',        nameEn: 'Brisbane',        lat: -27.47, lng: 153.03,  desc: 'Brisbane — Queensland\'s clear nights host bright ISS passes' },
  'perth':           { name: 'Perth',           nameEn: 'Perth',           lat: -31.95, lng: 115.86,  desc: 'Perth — One of the world\'s most isolated cities, superb dark skies' },
  'adelaide':        { name: 'Adelaide',        nameEn: 'Adelaide',        lat: -34.93, lng: 138.60,  desc: 'Adelaide — Southern Australian skies with dependable ISS views' },
  'auckland':        { name: 'Auckland',        nameEn: 'Auckland',        lat: -36.85, lng: 174.76,  desc: 'Auckland — New Zealand harbors reflect the passing station' },
  'wellington':      { name: 'Wellington',      nameEn: 'Wellington',      lat: -41.29, lng: 174.78,  desc: 'Wellington — Southern latitude offers unique ISS pass geometry' },
  'christchurch':    { name: 'Christchurch',    nameEn: 'Christchurch',    lat: -43.53, lng: 172.64,  desc: 'Christchurch — Gateway to Antarctica with pristine southern skies' },
  'rio-de-janeiro':  { name: 'Rio de Janeiro',  nameEn: 'Rio de Janeiro',  lat: -22.91, lng: -43.17,  desc: 'Rio de Janeiro — The ISS arcs over Christ the Redeemer and Copacabana' },
  'brasilia':        { name: 'Brasília',        nameEn: 'Brasilia',        lat: -15.79, lng: -47.88,  desc: 'Brasília — Planalto altitude and dry season clarity aid ISS viewing' },
  'montevideo':      { name: 'Montevideo',      nameEn: 'Montevideo',      lat: -34.90, lng: -56.16,  desc: 'Montevideo — Río de la Plata horizon for clean ISS rises' },
  'asuncion':        { name: 'Asunción',        nameEn: 'Asuncion',        lat: -25.26, lng: -57.58,  desc: 'Asunción — Paraguay\'s capital under bright subtropical passes' },
  'la-paz':          { name: 'La Paz',          nameEn: 'La Paz',          lat: -16.49, lng: -68.12,  desc: 'La Paz — At 3,600m altitude, the thinnest air between you and the ISS' },
  'quito':           { name: 'Quito',           nameEn: 'Quito',           lat: -0.18,  lng: -78.47,  desc: 'Quito — On the equator at altitude: direct overhead ISS passes' },
  'caracas':         { name: 'Caracas',         nameEn: 'Caracas',         lat: 10.48,  lng: -66.90,  desc: 'Caracas — Ávila mountain views of Caribbean ISS crossings' },
  'panama-city':     { name: 'Panama City',     nameEn: 'Panama City',     lat: 8.98,   lng: -79.52,  desc: 'Panama City — Two-ocean horizons for tropical station passes' },
  'guatemala-city':  { name: 'Guatemala City',  nameEn: 'Guatemala City',  lat: 14.63,  lng: -90.51,  desc: 'Guatemala City — Volcano silhouettes beneath the ISS path' },
  'havana':          { name: 'Havana',          nameEn: 'Havana',          lat: 23.11,  lng: -82.37,  desc: 'Havana — Caribbean clarity along the Malecón for ISS watching' },
  'san-juan':        { name: 'San Juan',        nameEn: 'San Juan',        lat: 18.47,  lng: -66.11,  desc: 'San Juan — Puerto Rico\'s ocean horizons frame ISS passes' },
  'monterrey':       { name: 'Monterrey',       nameEn: 'Monterrey',       lat: 25.69,  lng: -100.32, desc: 'Monterrey — Sierra Madre backdrop for bright northern Mexico passes' },
  'guadalajara':     { name: 'Guadalajara',     nameEn: 'Guadalajara',     lat: 20.66,  lng: -103.35, desc: 'Guadalajara — Highland altitude improves ISS visibility' },
}

export default function CityPage() {
  const { city } = useParams<{ city: string }>()
  const data = city ? CITY_DATA[city] : null
  const [issPos, setIssPos] = useState<{ lat: number; lng: number; alt: number } | null>(null)

  useEffect(() => {
    if (!data) return
    document.title = `ISS over ${data.name} — Live Tracker | SpaceHub`
    const desc = document.querySelector('meta[name="description"]')
    if (desc) desc.setAttribute('content', `Track the International Space Station live over ${data.name}. See real-time ISS position, distance, altitude and get notified when it passes overhead.`)
  }, [data])

  useEffect(() => {
    if (!data) return
    fetch('/api/iss')
      .then(r => r.json())
      .then(d => setIssPos({ lat: d.latitude, lng: d.longitude, alt: d.altitude }))
      .catch(() => {})
  }, [data])

  if (!data) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-4xl mb-4">🌍</p>
      <h2 className="text-2xl font-bold text-white mb-4">City Not Found</h2>
      <Link to="/" className="text-indigo-400 hover:text-indigo-300">Back to SpaceHub</Link>
    </div>
  )

  const dist = issPos ? (() => {
    const R = 6371
    const dLat = (issPos.lat - data.lat) * Math.PI / 180
    const dLng = (issPos.lng - data.lng) * Math.PI / 180
    const a = Math.sin(dLat/2)**2 + Math.cos(data.lat*Math.PI/180)*Math.cos(issPos.lat*Math.PI/180)*Math.sin(dLng/2)**2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))
  })() : null

  return (
    <div className="min-h-screen" style={{ background: '#050816' }}>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link to="/" className="text-indigo-400 text-sm mb-8 hover:text-indigo-300 flex items-center gap-1">← Back to SpaceHub</Link>

        <div className="text-center mb-10">
          <span className="section-label mb-4 inline-flex">🛸 ISS</span>
          <h1 className="text-4xl font-black text-white mt-3">
            ISS over <span className="gradient-text">{data.name}</span>
          </h1>
          <p className="text-gray-500 mt-2">{data.desc}</p>
        </div>

        {/* Live stats */}
        {issPos && dist !== null && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">{dist.toLocaleString()}</p>
              <p className="text-xs text-gray-600">km from ISS</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">{issPos.alt.toFixed(0)}</p>
              <p className="text-xs text-gray-600">ISS Altitude (km)</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-black gradient-text">92</p>
              <p className="text-xs text-gray-600">mins per orbit</p>
            </div>
          </div>
        )}

        <ISSAlertSystem />

        {/* SEO content */}
        <div className="space-card p-6 mt-6">
          <h2 className="text-lg font-bold text-white mb-3">When to See the ISS from {data.name}?</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">
            The International Space Station (ISS) passes over {data.name} (lat {data.lat.toFixed(1)}°, lon {data.lng.toFixed(1)}°) several times each day.
            It is visible to the naked eye as a bright moving white dot in the sky, typically 30–45 minutes before sunrise or after sunset.
          </p>
          <p className="text-gray-400 text-sm leading-relaxed">
            Use SpaceHub's ISS Live system to know exactly when the ISS passes over {data.name} and get an alert in advance.
          </p>
        </div>

        {/* Other cities */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-widest">More Cities</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CITY_DATA).filter(([slug]) => slug !== city).map(([slug, c]) => (
              <Link key={slug} to={`/iss/${slug}`} className="text-xs px-3 py-1.5 glass rounded-lg border border-white/5 text-gray-500 hover:text-indigo-400 hover:border-indigo-500/30 transition">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
