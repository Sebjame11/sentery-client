import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import useStore from '../store/useStore';
import { formatMoney, esc, countryFlag } from '../utils/helpers';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const GEO_NAME_MAP = {
    'United States':'United States of America','Czech Republic':'Czechia','South Korea':'Republic of Korea','UAE':'United Arab Emirates',
};

function geoName(name) { return GEO_NAME_MAP[name] || name; }
function reverseGeoName(geo) { for (const [k,v] of Object.entries(GEO_NAME_MAP)) { if (v === geo) return k; } return geo; }

const REGION_META = {
    na:{label:'North America',icon:'\u{1F1FA}\u{1F1F8}',desc:'US / Canada / Mexico'},
    eu:{label:'Europe',icon:'\u{1F1EA}\u{1F1FA}',desc:'UK / Germany / France / Nordics'},
    apac:{label:'Asia Pacific',icon:'\u{1F1F0}\u{1F1F7}',desc:'Japan / India / Aus / SEA'},
    latam:{label:'Latin America',icon:'\u{1F1E7}\u{1F1F7}',desc:'Brazil / Argentina / Chile'},
    mea:{label:'Middle East & Africa',icon:'\u{1F1F2}\u{1F1FE}',desc:'UAE / Israel / South Africa'},
};

const COUNTRY_REGIONS = {
    'United States':'na','Canada':'na',
    'United Kingdom':'eu','Germany':'eu','France':'eu','Netherlands':'eu','Spain':'eu','Italy':'eu','Sweden':'eu','Norway':'eu','Finland':'eu','Denmark':'eu','Ireland':'eu','Belgium':'eu','Switzerland':'eu','Austria':'eu','Poland':'eu','Portugal':'eu','Czech Republic':'eu',
    'Japan':'apac','China':'apac','India':'apac','Australia':'apac','South Korea':'apac','Singapore':'apac','New Zealand':'apac','Indonesia':'apac','Thailand':'apac','Vietnam':'apac','Malaysia':'apac','Philippines':'apac',
    'Brazil':'latam','Argentina':'latam','Colombia':'latam','Chile':'latam','Peru':'latam','Mexico':'latam',
    'UAE':'mea','Saudi Arabia':'mea','Israel':'mea','South Africa':'mea','Nigeria':'mea','Egypt':'mea','Kenya':'mea',
};

function getRegion(country) { return COUNTRY_REGIONS[country] || null; }

function WorldMap({ countryCounts, maxCount, selectedCountry, onCountryClick, onHover, selectedRegion }) {
    const [features, setFeatures] = useState(null);
    const svgRef = useRef(null);
    const [dims, setDims] = useState({ w: 600, h: 360 });

    useEffect(() => {
        fetch(GEO_URL).then(r => r.json()).then(topo => { setFeatures(feature(topo, topo.objects.countries).features); }).catch(() => {});
    }, []);

    useEffect(() => {
        const el = svgRef.current?.parentElement;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            for (const e of entries) { const { width } = e.contentRect; setDims({ w: Math.max(200, width - 16), h: Math.max(140, (width - 16) * 0.55) }); }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const projection = geoMercator().fitSize([dims.w, dims.h], { type: 'Sphere' });
    const pathGen = geoPath().projection(projection);

    return (
        <svg ref={svgRef} viewBox={`0 0 ${dims.w} ${dims.h}`} style={{width:'100%',height:'auto',display:'block'}}>
            {features && features.map(f => {
                const name = f.properties.name;
                const ourName = reverseGeoName(name);
                const count = countryCounts[name] || 0;
                const isSelected = ourName === selectedCountry;
                const isActive = selectedRegion && getRegion(ourName) === selectedRegion;
                const intensity = maxCount > 0 ? count / maxCount : 0;
                const hasData = count > 0;
                const fill = !hasData ? 'var(--bg-sunken)' : isSelected ? 'var(--accent)' : `color-mix(in srgb, var(--accent) ${15 + intensity * 65}%, var(--bg-canvas))`;
                return (
                    <path key={f.id} d={pathGen(f)}
                        fill={fill}
                        stroke={isSelected ? 'var(--accent)' : isActive ? 'color-mix(in srgb, var(--accent) 60%, transparent)' : 'var(--border)'}
                        strokeWidth={isSelected ? 1.5 : isActive ? 1.2 : 0.35}
                        style={{cursor:hasData?'pointer':'default',transition:'fill 0.2s, stroke 0.2s',outline:'none'}}
                        onClick={() => hasData && onCountryClick(ourName)}
                        onMouseEnter={(e) => hasData && onHover({name:ourName,count,x:e.clientX,y:e.clientY})}
                        onMouseMove={(e) => hasData && onHover({name:ourName,count,x:e.clientX,y:e.clientY})}
                        onMouseLeave={() => onHover(null)}
                    />
                );
            })}
        </svg>
    );
}

function RegionCard({ r, count, value, maxVal, selected, onClick }) {
    const pct = maxVal > 0 ? value / maxVal : 0;
    return (
        <div className={`mac-stat`} style={{cursor:'pointer',borderColor:selected?'var(--accent)':'var(--glass-border)',transition:'border-color 0.15s',overflow:'visible'}} onClick={onClick}>
            <div className="mac-flex" style={{gap:6,marginBottom:2}}>
                <span style={{fontSize:16,lineHeight:1}}>{r.icon}</span>
                <span style={{fontSize:'0.72rem',fontWeight:selected?600:400,color:selected?'var(--accent)':'var(--text-primary)'}}>{r.label}</span>
            </div>
            <div className="mac-stat-value" style={{fontSize:'1.1rem',fontWeight:500}}>{count}</div>
            <div className="mac-stat-label">{formatMoney(value)} pipeline</div>
            <div className="mac-stat-bar" style={{marginTop:6}}><div className="mac-stat-bar-fill" style={{width:Math.round(pct*100)+'%',background:selected?'var(--accent)':'var(--text-tertiary)'}} /></div>
        </div>
    );
}

export default function TerritoryMap() {
    const prospects = useStore(s => s.prospects);
    const setDetailId = useStore(s => s.setDetailId);
    const [selectedRegion, setSelectedRegion] = useState(null);
    const [selectedCountry, setSelectedCountry] = useState(null);
    const [hovered, setHovered] = useState(null);
    const tipRef = useRef(null);
    useLayoutEffect(() => {
        if (hovered && tipRef.current) { tipRef.current.style.left = hovered.x + 'px'; tipRef.current.style.top = (hovered.y - 8) + 'px'; }
    }, [hovered]);

    const pCountries = (p) => p.countries?.length ? p.countries : (p.country ? [p.country] : []);

    const regionData = Object.entries(REGION_META).map(([id, meta]) => {
        const rp = prospects.filter(p => pCountries(p).some(c => getRegion(c) === id));
        return { ...meta, id, count: rp.length, value: rp.reduce((s, p) => s + (p.dealValue || 0), 0) };
    });
    const maxRegionVal = Math.max(...regionData.map(r => r.value), 1);

    const filteredProspects = prospects.filter(p => {
        const cs = pCountries(p);
        if (selectedCountry) return cs.includes(selectedCountry);
        if (selectedRegion) return cs.some(c => getRegion(c) === selectedRegion);
        return true;
    });

    const allCountryNames = [...new Set(prospects.flatMap(p => pCountries(p)).filter(Boolean))].sort();
    const countryData = allCountryNames.map(c => ({
        name:c, region:getRegion(c),
        count:prospects.filter(p => pCountries(p).includes(c)).length,
        value:prospects.filter(p => pCountries(p).includes(c)).reduce((s, p) => s + (p.dealValue || 0), 0),
    })).sort((a, b) => b.count - a.count);

    const maxCount = Math.max(...countryData.map(c => c.count), 1);
    const countryCounts = {};
    countryData.forEach(c => { countryCounts[geoName(c.name)] = c.count; });

    return (
        <div className="mac-page">
            <div className="mac-page-header">
                <div className="mac-flex" style={{gap:12}}>
                    <h1 className="mac-page-title">Territory View</h1>
                    <div className="mac-page-sub">{prospects.length} prospects across {allCountryNames.length} countries</div>
                </div>
                {(selectedRegion || selectedCountry) && <button className="mac-btn mac-btn-ghost mac-btn-sm" onClick={() => { setSelectedRegion(null); setSelectedCountry(null); }}>Clear filter</button>}
            </div>

            <div className="mac-stats" style={{gap:10}}>
                {regionData.map(r => (
                    <RegionCard key={r.id} r={r} count={r.count} value={r.value} maxVal={maxRegionVal}
                        selected={selectedRegion === r.id}
                        onClick={() => { setSelectedRegion(selectedRegion === r.id ? null : r.id); setSelectedCountry(null); }} />
                ))}
            </div>

            <div className="mac-split">
                <div className="mac-split-sidebar" style={{width:'40%'}}>
                    <div className="mac-group" style={{marginBottom:0,display:'flex',flexDirection:'column'}}>
                        <div className="mac-group-header" style={{paddingBottom:6}}>
                            <span>World Map</span>
                            {selectedCountry && <span style={{fontSize:'0.7rem',color:'var(--accent)',fontWeight:400}}>{esc(selectedCountry)}</span>}
                        </div>
                        <div style={{padding:'4px 8px 0'}}><WorldMap countryCounts={countryCounts} maxCount={maxCount} selectedCountry={selectedCountry} selectedRegion={selectedRegion} onCountryClick={(name) => setSelectedCountry(selectedCountry === name ? null : name)} onHover={setHovered} /></div>
                        <div ref={tipRef} className="map-tooltip" style={{display:hovered?'block':'none',position:'fixed',zIndex:100,background:'var(--glass-bg)',backdropFilter:'blur(14px)',border:'1px solid var(--glass-border)',borderRadius:6,boxShadow:'var(--glass-shadow)',padding:'3px 8px',fontSize:'0.75rem',pointerEvents:'none',whiteSpace:'nowrap',lineHeight:1.3,transform:'translate(-50%,-100%)'}}>
                            <span style={{fontWeight:600}}>{hovered?.name}</span><span style={{color:'var(--text-tertiary)',marginLeft:5}}>{hovered?.count || 0}</span>
                        </div>
                        <div className="mac-flex" style={{gap:10,padding:'4px 16px 8px',fontSize:'0.62rem',color:'var(--text-tertiary)'}}>
                            <span className="mac-flex" style={{gap:3}}><span style={{width:8,height:8,borderRadius:2,background:'var(--bg-sunken)',display:'inline-block'}}></span>No data</span>
                            <span style={{flex:1,height:4,borderRadius:2,background:`linear-gradient(90deg, color-mix(in srgb, var(--accent) 15%, var(--bg-canvas)), var(--accent))`,display:'inline-block'}}></span>
                            <span>{maxCount}</span>
                        </div>
                        <div style={{borderTop:'1px solid var(--border)',padding:'8px 16px',maxHeight:180,overflowY:'auto'}}>
                            <div style={{fontSize:'0.62rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Top Countries</div>
                            {countryData.slice(0, 15).map((c, i) => (
                                <div key={c.name} className="mac-row" style={{padding:'4px 4px',margin:'0 -4px',opacity:selectedCountry && selectedCountry !== c.name ? 0.35 : 1,fontSize:'0.75rem'}} onClick={() => setSelectedCountry(selectedCountry === c.name ? null : c.name)}>
                                    <span style={{fontSize:'0.62rem',color:'var(--text-tertiary)',minWidth:16,textAlign:'right'}}>#{i+1}</span>
                                    {countryFlag(c.name) ? <span className={countryFlag(c.name)} style={{fontSize:14}}></span> : <span style={{width:18}}></span>}
                                    <span className="mac-row-title" style={{fontWeight:selectedCountry === c.name ? 600 : 400}}>{c.name}</span>
                                    <span className="mac-row-value" style={{fontSize:'0.72rem',fontWeight:500,color:'var(--text-primary)'}}>{c.count}</span>
                                    <span style={{fontSize:'0.65rem',color:'var(--accent)',minWidth:50,textAlign:'right'}}>{formatMoney(c.value)}</span>
                                    <div style={{width:40,height:3,borderRadius:2,background:'var(--bg-sunken)',overflow:'hidden'}}>
                                        <div style={{width:Math.round(c.count/maxCount*100)+'%',height:'100%',background:'var(--accent)',borderRadius:2,transition:'width 0.4s'}}></div>
                                    </div>
                                </div>
                            ))}
                            {countryData.length === 0 && <div className="mac-empty" style={{padding:'16px 0',fontSize:'0.75rem'}}><div className="mac-empty-desc">No countries with data</div></div>}
                        </div>
                    </div>
                </div>
                <div className="mac-split-content">
                    <div className="mac-group" style={{marginBottom:0}}>
                        <div className="mac-group-header">
                            <span>{selectedCountry || selectedRegion ? (selectedCountry || REGION_META[selectedRegion]?.label) : 'All Prospects'}</span>
                            <span className="mac-group-header-count">({filteredProspects.length})</span>
                        </div>
                        <div className="mac-table-wrap" style={{maxHeight:420,overflowY:'auto'}}>
                            <table className="mac-table">
                                <thead><tr><th>Company</th><th>Contact</th><th>Country</th><th>Industry</th><th>Value</th><th>Stage</th></tr></thead>
                                <tbody>
                                    {filteredProspects.sort((a, b) => (b.dealValue || 0) - (a.dealValue || 0)).map(p => (
                                        <tr key={p.id} style={{cursor:'pointer'}} onClick={() => setDetailId(p.id)}>
                                            <td style={{fontWeight:500}}>{esc(p.company)}</td>
                                            <td>{esc(p.name)}</td>
                                            <td style={{fontSize:'0.75rem'}}>{(pCountries(p)).map(c => countryFlag(c) ? <span key={c} className={countryFlag(c)} style={{marginRight:3,fontSize:12}} title={c}></span> : null)}<span style={{color:'var(--text-tertiary)'}}>{(pCountries(p)).join(', ') || '-'}</span></td>
                                            <td style={{fontSize:'0.78rem'}}>{esc(p.industry)}</td>
                                            <td style={{fontWeight:500,fontSize:'0.78rem'}}>{formatMoney(p.dealValue)}</td>
                                            <td><span className="mac-badge" style={{background:`var(--${p.stage}-tint)`,color:`var(--${p.stage === 'won' ? 'success' : p.stage === 'lost' ? 'danger' : 'accent'})`}}>{p.stage.toUpperCase()}</span></td>
                                        </tr>
                                    ))}
                                    {filteredProspects.length === 0 && <tr><td colSpan={6} style={{textAlign:'center',padding:'32px 0',color:'var(--text-tertiary)',fontSize:'0.82rem'}}>No prospects match the current filter</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
