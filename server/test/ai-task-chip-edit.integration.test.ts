import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prisma} from '../src/db/prisma.js';
import {prepareTaskProposal,editTaskProposal,applyTaskProposal,undoTaskProposal} from '../src/services/ai-task-proposal.service.js';

test('task chip edits keep one task, owner boundary and reversible history',async()=>{
  assert.ok(process.env.DATABASE_URL?.startsWith('postgresql://'));
  const suffix=randomUUID();
  const [owner,other]=await Promise.all([
    prisma.user.create({data:{email:'taskchip-a-'+suffix+'@example.test'}}),
    prisma.user.create({data:{email:'taskchip-b-'+suffix+'@example.test'}})
  ]);
  try{
    const item=await prisma.task.create({data:{
      userId:owner.id,title:'Изначально',importance:3,urgency:4,
      status:'TODO',description:'Исходное описание'
    }});
    const action={
      operation:'rename',itemId:item.id,title:'От ИИ',parentTaskId:null,
      description:null,dueDate:null,importance:null,urgency:null,
      notifyBeforeMinutes:null,sphereId:null,location:null
    };
    const proposed=await prepareTaskProposal({
      userId:owner.id,requestId:'task-edit-'+suffix,source:'planner',
      actions:[action],resolvedItemIds:[item.id],resolvedSphereIds:[],autoApply:false
    });
    const first=proposed.operations[0]!.editable!;
    const pending=await editTaskProposal(owner.id,proposed.id,{
      index:0,revision:proposed.revision,
      values:{...first,title:'Согласованное название',importance:5}
    });
    assert.equal(pending.status,'PENDING');
    assert.equal(pending.operations[0]?.editable?.title,'Согласованное название');
    await assert.rejects(()=>editTaskProposal(other.id,proposed.id,{
      index:0,revision:pending.revision,values:pending.operations[0]?.editable
    }),/не найдено/);
    const applied=await applyTaskProposal(owner.id,proposed.id);
    assert.equal(applied.status,'APPLIED');
    const one=await prisma.task.findUniqueOrThrow({where:{id:item.id}});
    assert.equal(one.title,'Согласованное название');
    assert.equal(one.importance,5);
    assert.equal(await prisma.task.count({where:{userId:owner.id}}),1);
    const edited=await editTaskProposal(owner.id,proposed.id,{
      index:0,revision:applied.revision,
      values:{...applied.operations[0]?.editable,title:'Уточнённое название'}
    });
    assert.equal(edited.status,'APPLIED');
    assert.equal((await prisma.task.findUniqueOrThrow({where:{id:item.id}})).title,
      'Уточнённое название');
    await assert.rejects(()=>editTaskProposal(owner.id,proposed.id,{
      index:0,revision:applied.revision,
      values:{...applied.operations[0]?.editable,title:'Старая вкладка'}
    }),/другом окне/);
    const undone=await undoTaskProposal(owner.id,proposed.id);
    assert.equal(undone.status,'UNDONE');
    const restored=await prisma.task.findUniqueOrThrow({where:{id:item.id}});
    assert.equal(restored.title,'Изначально');
    assert.equal(restored.importance,3);
  }finally{
    await prisma.user.deleteMany({where:{id:{in:[owner.id,other.id]}}});
    await prisma.$disconnect();
  }
});
