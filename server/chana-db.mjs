// The game uses a small prepared-statement interface so the scoring/API remains
// identical to the tested standalone version. All values stay bound parameters.
export function chanaDatabase(client) {
 const prepare=(input,args=[])=>{
  let sql=input.replace(/\brooms\b/g,'chana_rooms').replace(/\bplayers\b/g,'chana_players');
  const ignore=/^INSERT OR IGNORE /i.test(sql);sql=sql.replace(/^INSERT OR IGNORE /i,'INSERT ');
  let index=0;sql=sql.replace(/\?/g,()=>'$'+(++index));if(ignore)sql+=' ON CONFLICT DO NOTHING';
  const execute=async()=>{
   const result=await client.query(sql,args);
   for(const row of result.rows)for(const key of ['created_at','expires_at','joined_at','updated_at'])if(row[key]!=null)row[key]=Number(row[key]);
   return result;
  };
  return {bind(...values){return prepare(input,values);},async first(){return (await execute()).rows[0]||null;},async all(){return {results:(await execute()).rows};},async run(){return {meta:{changes:(await execute()).rowCount},success:true};}};
 };
 return {prepare};
}
