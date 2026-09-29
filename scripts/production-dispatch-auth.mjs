export function validateOwnerProductionDispatch({ repository, ref, actor, triggeringActor }) {
  if (repository !== 'herehigher/resume' || ref !== 'refs/heads/main'
    || actor !== 'herehigher' || triggeringActor !== 'herehigher') {
    throw new Error('production action requires an owner-triggered dispatch on the official main branch');
  }
  return true;
}
