import {Link} from 'react-router-dom';
import {useSite} from './Marketing';
type IconName='pin'|'phone'|'clock'|'instagram'|'message'|'external'|'lock';
function Icon({name}:{name:IconName}){
 const paths:Record<IconName,React.ReactNode>={
  pin:<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  phone:<path d="m7 3 3 5-2 2c1.5 3 3 4.5 6 6l2-2 5 3-1 4C10 23 1 14 3 4Z"/>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  instagram:<><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".5"/></>,
  message:<path d="M21 11.5a9 9 0 0 1-9 9 11 11 0 0 1-4-.8L3 21l1.3-4.8a9 9 0 1 1 16.7-4.7Z"/>,
  external:<><path d="M14 3h7v7m0-7L11 13"/><path d="M10 5H4v15h15v-6"/></>,
  lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></>,
 };
 return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
export function Footer(){
 const {site}=useSite();const copy=site.copy;
 const year=new Intl.DateTimeFormat('en',{timeZone:'Asia/Taipei',year:'numeric'}).format(new Date());
 return <footer className="site-footer"><div className="footer-inner"><div className="footer-columns">
  <section className="footer-about" aria-label={site.brandName}><Link to="/" className="footer-brand">{site.brandName}</Link><p>{copy.footerDescription}</p></section>
  <section className="footer-contact" aria-label={copy.footerContactTitle}><h2>{copy.footerContactTitle}</h2><ul>
   <li><Icon name="pin"/><span>{site.address}</span></li>
   <li><Icon name="phone"/><a href={'tel:'+site.phone}>{site.phone}</a></li>
   <li title={copy.footerNote}><Icon name="clock"/><span>{copy.footerHours}</span></li>
   {site.instagramUrl&&<li><Icon name="instagram"/><a href={site.instagramUrl} target="_blank" rel="noopener noreferrer">{copy.instagramLabel}<Icon name="external"/></a></li>}
   {site.lineUrl&&<li><Icon name="message"/><a href={site.lineUrl} target="_blank" rel="noopener noreferrer">{copy.lineLabel}<Icon name="external"/></a></li>}
  </ul></section>
 </div><div className="footer-bottom"><div className="footer-copyright"><span>© {year} {site.shopName}. {copy.footerCopyright}</span><Link className="admin-lock" to="/admin/bookings" aria-label={copy.adminLink} title={copy.adminLink}><Icon name="lock"/></Link></div><p>{site.address} · {copy.footerBookingNote}</p></div></div></footer>;
}
