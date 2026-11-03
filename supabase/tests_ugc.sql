\set QUIET on
\pset tuples_only on
-- Uses the helpers and people created in tests_security.sql (run that first, same database).
delete from public._results;
reset role;
insert into public.instagram_connections(brand_id, ig_user_id, username) values ('ttc','17841400000000001','thetilecollective');
select set_config('request.jwt.claim.role','service_role',false); set role service_role;
insert into public.ugc_items(id,brand_id,fingerprint,sources,external_id,permalink,creator_handle,caption,preview_url,posted_at,relevance_score)
values ('u1','ttc','ig:ABC123',array['instagram_tag'],'901','https://www.instagram.com/p/ABC123/','@Jane.Builds','Our new ensuite with Bora Ice Polished','https://cdn.test/x.jpg','2026-10-20',80);
select public._ok('Server discovery can add tagged posts', exists(select 1 from public.ugc_items where id='u1' and creator_handle='jane.builds'));
select public._fails('The same post cannot be added twice for a brand', $q$insert into public.ugc_items(brand_id,fingerprint,sources) values ('ttc','ig:ABC123',array['instagram_mention'])$q$);
insert into public.ugc_items(id,brand_id,fingerprint,sources) values ('u-cto','cto','ig:ABC123',array['instagram_tag']);
select public._ok('The same post can exist separately for the other brand', exists(select 1 from public.ugc_items where id='u-cto'));
reset role;

set role authenticated;
select public._as('00000000-0000-0000-0000-00000000000c'); -- TTC contributor
select public._fails('Contributor cannot add API-sourced items', $q$insert into public.ugc_items(brand_id,fingerprint,sources) values ('ttc','ig:FAKE',array['instagram_tag'])$q$);
insert into public.ugc_items(id,brand_id,fingerprint,sources,permalink,creator_handle) values ('u2','ttc','ig:LATER1',array['later_import'],'https://www.instagram.com/p/LATER1/','studio.co');
select public._ok('Contributor can import a post from Later by hand', exists(select 1 from public.ugc_items where id='u2'));
select public._fails('Contributor cannot pre-set permission on import', $q$insert into public.ugc_items(brand_id,fingerprint,sources,permission_status) values ('ttc','ig:X2',array['manual'],'Permission granted')$q$);
select public._fails('Contributor cannot change AI suggestions or scores', $q$update public.ugc_items set relevance_score=100 where id='u1'$q$);
update public.ugc_items set permission_status='Permission requested', permission_requested_via='Instagram DM' where id='u1';
select public._ok('Contributor can record that permission was requested', (select permission_status::text from public.ugc_items where id='u1')='Permission requested');
select public._fails('Contributor cannot record permission as granted', $q$update public.ugc_items set permission_status='Permission granted', permission_evidence='DM reply yes', usage_scope=array['organic_social'], attribution='📷 @jane.builds' where id='u1'$q$);
select public._fails('Other brand staff cannot see TTC UGC', $q$do $d$ begin perform public._as('00000000-0000-0000-0000-00000000000b'); if exists (select 1 from public.ugc_items where id='u1') then raise exception 'visible'; end if; raise exception 'hidden'; end $d$$q$);

-- A draft that uses the UGC cannot be approved or scheduled until permission is granted
select public._as('00000000-0000-0000-0000-00000000000a'); -- Georgia (admin)
insert into public.content_items(id,brand_id,title,caption,scheduled_at,status,ugc_id) values ('cu1','ttc','Customer Projects: Jane''s ensuite','A calm ensuite. 📷 @jane.builds','2026-12-02 18:00+10','Needs Review','u1');
select public._fails('Cannot link UGC from the other brand', $q$insert into public.content_items(id,brand_id,title,ugc_id) values ('cu2','ttc','x','u-cto')$q$);
select public._fails('Approval refused without the creator''s permission', $q$select public.approve_content('cu1')$q$);
select public._fails('Granting permission requires evidence', $q$update public.ugc_items set permission_status='Permission granted', usage_scope=array['organic_social'], attribution='📷 @jane.builds' where id='u1'$q$);
select public._fails('Granting permission requires a usage scope', $q$update public.ugc_items set permission_status='Permission granted', permission_evidence='DM reply: yes happy for you to share', attribution='📷 @jane.builds' where id='u1'$q$);
update public.ugc_items set permission_status='Permission granted', permission_evidence='DM reply 4 Nov: "Yes, happy for you to share with credit"', usage_scope=array['organic_social','stories'], attribution='📷 @jane.builds', usage_expires_on='2027-12-31' where id='u1';
select public._ok('Approver records permission with evidence, scope and credit', public.ugc_permission_ok('u1'));
select public._ok('Every permission change is kept', (select count(*) from public.ugc_permission_events where ugc_id='u1')=2);
select public.approve_content('cu1');
select public._ok('Approval allowed once permission is granted', (select status from public.content_items where id='cu1')='Approved');
update public.ugc_items set permission_status='Permission declined' where id='u1';
select public._fails('Scheduling refused after the creator withdraws permission', $q$select public.mark_scheduled_manual('cu1')$q$);
select public._ok('Declining clears the usage scope', (select usage_scope from public.ugc_items where id='u1')='{}');
select public._fails('Permission history cannot be edited', $q$update public.ugc_permission_events set status='Permission granted'$q$);
select public._fails('Permission history cannot be deleted', $q$delete from public.ugc_permission_events$q$);
reset role;
select public._fails('Saving media is blocked without permission (even for server code)', $q$do $d$ begin perform set_config('request.jwt.claim.role','service_role',true); insert into public.assets(id,brand_id,storage_path,file_name,ugc_id) values ('ax','ttc','ttc/ugc-x.jpg','x.jpg','u1'); end $d$$q$);
update public.ugc_items set permission_status='Permission granted', permission_evidence='Re-confirmed by email 6 Nov', usage_scope=array['organic_social'], attribution='📷 @jane.builds' where id='u1';
insert into public.assets(id,brand_id,storage_path,file_name,ugc_id) values ('ax','ttc','ttc/ugc-x.jpg','x.jpg','u1');
select public._ok('Media can be saved once permission is granted', exists(select 1 from public.assets where id='ax' and ugc_id='u1' and not approved));
select public._ok('UGC jobs: contributors can queue recommendations', true);
set role authenticated; select public._as('00000000-0000-0000-0000-00000000000c');
select public._ok('Contributor can queue AI recommendations', public.enqueue_job('ugc.recommend','ttc') is not null);
select public._fails('Contributor cannot run discovery', $q$select public.enqueue_job('ugc.discover','ttc')$q$);
reset role;
select public._ok('Audit chain still verifies', (select ok from public.verify_audit_chain()));
select format('%s  %s%s', case when pass then 'PASS' else 'FAIL' end, label, case when pass then '' else '  →  '||coalesce(detail,'') end) from public._results order by n;
select format('%s/%s UGC tests passed', count(*) filter (where pass), count(*)) from public._results;
