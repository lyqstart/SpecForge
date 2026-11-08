import ts from 'typescript';

export interface SourceFinding {line:number;col:number;text:string;rule:string;}
const callName=(node:ts.CallExpression)=>ts.isIdentifier(node.expression)?node.expression.text:ts.isPropertyAccessExpression(node.expression)?node.expression.name.text:'';
function collect(root:ts.Node,predicate:(node:ts.Node)=>boolean):ts.Node[]{const nodes:ts.Node[]=[];const visit=(node:ts.Node)=>{if(predicate(node))nodes.push(node);ts.forEachChild(node,visit);};visit(root);return nodes;}
function location(source:ts.SourceFile,node:ts.Node,rule:string):SourceFinding{const point=source.getLineAndCharacterOfPosition(node.getStart(source));return {line:point.line+1,col:point.character+1,text:node.getText(source),rule};}
/** Syntax review, not a proof of resource safety. Runtime ownership tests remain required. */
export function reviewRaceTimers(content:string,file='source.ts'):SourceFinding[]{
 const source=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true),findings:SourceFinding[]=[];
 for(const node of collect(source,n=>ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(source)==='Promise'&&n.expression.name.text==='race')){
  let owner:ts.Node=node;while(owner.parent&&!ts.isFunctionLike(owner))owner=owner.parent;
  const timers=collect(owner,n=>ts.isCallExpression(n)&&callName(n)==='setTimeout');if(!timers.length)continue;
  const handles=timers.map(timer=>{let current:ts.Node=timer;while(current!==owner){const parent=current.parent;if(ts.isVariableDeclaration(parent)&&parent.initializer===current)return parent.name.getText(source);if(ts.isBinaryExpression(parent)&&parent.operatorToken.kind===ts.SyntaxKind.EqualsToken&&parent.right===current)return parent.left.getText(source);if(ts.isFunctionLike(parent))break;current=parent;}return null;});
  let protectedRace=false,current:ts.Node=node;
  while(current.parent&&current!==owner){const parent=current.parent;if(ts.isTryStatement(parent)&&parent.tryBlock===current&&parent.finallyBlock){const clears=collect(parent.finallyBlock,n=>ts.isCallExpression(n)&&callName(n)==='clearTimeout').map(n=>(n as ts.CallExpression).arguments[0]?.getText(source).replace(/!$/,''));if(handles.every(handle=>handle!==null&&clears.includes(handle)))protectedRace=true;}current=parent;}
  if(!protectedRace)findings.push(location(source,node,'C1'));
 }
 return findings;
}
/** Real string/template tokens only: prose, comments and product command names are not paths. */
export function reviewPathLiterals(content:string,file='source.ts'):SourceFinding[]{
 const source=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true),result:SourceFinding[]=[];
 for(const node of collect(source,n=>ts.isStringLiteralLike(n)||ts.isTemplateHead(n))){
  const text=(node as ts.StringLiteralLike|ts.TemplateHead).text;
  if(text==='.specforge'||/^\.specforge[/\\]/.test(text)||/^specforge[/\\]/.test(text))result.push(location(source,node,'PATH_LITERAL'));
  else if(text==='specforge'&&ts.isCallExpression(node.parent)&&['join','resolve'].includes(callName(node.parent))&&node.parent.arguments[1]===node&&/projectRoot|homedir\(|\bhome\b/i.test(node.parent.arguments[0]?.getText(source)??''))result.push(location(source,node,'PATH_LITERAL'));
 }
 return result;
}
