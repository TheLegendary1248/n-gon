//matter.js ***********************************************************

// module aliases
const Engine = Matter.Engine,
    Events = Matter.Events,
    Composites = Matter.Composites,
    Composite = Matter.Composite,
    Constraint = Matter.Constraint,
    Vertices = Matter.Vertices,
    Query = Matter.Query,
    Body = Matter.Body,
    Bodies = Matter.Bodies,
    Vector = Matter.Vector,
    Sleeping = Matter.Sleeping;

// create an engine
const engine = Engine.create();
engine.world.gravity.scale = 0; //turn off gravity (it's added back in later)
// matter events
/** @param {Matter.IEventCollision<Matter.Engine>} event */
function playerOnGroundCheck(event) {
    //runs on collisions events
    function enter() {
        m.numTouching++;
        if (!m.onGround) {
            m.onGround = true;
            if (m.crouch) {
                if (m.checkHeadClear()) {
                    m.undoCrouch();
                } else {
                    m.yOffGoal = m.yOffWhen.crouch;
                }
            } else {
                //sets a hard land where player stays in a crouch for a bit and can't jump
                //crouch is forced in groundControl below
                const momentum = player.velocity.y * player.mass //player mass is 5 so this triggers at 26 down velocity, unless the player is holding something
                if (momentum > tech.hardLanding) {
                    m.doCrouch();
                    m.yOff = m.yOffWhen.jump;
                    m.hardLandCD = m.cycle + Math.min(momentum / 6.5 - 6, 40)
                    //falling damage
                    if (tech.isFallingDamage && m.immuneCycle < m.cycle && momentum > 150) {
                        m.damage(Math.min(Math.sqrt(momentum - 133) * 0.01, 0.25));
                        if (m.immuneCycle < m.cycle + m.collisionImmuneCycles) m.immuneCycle = m.cycle + m.collisionImmuneCycles; //player is immune to damage for 30 cycles
                    }
                } else {
                    m.yOffGoal = m.yOffWhen.stand;
                }
            }
        }
    }

    const pairs = event.pairs;
    let jumpSensorIndex = pairs.findIndex(e => e.bodyA == jumpSensor || e.bodyB == jumpSensor)
    if(jumpSensorIndex != -1)
    {
        let pair = pairs[jumpSensorIndex];
        if (pair.bodyA === jumpSensor) {
            m.standingOn = pair.bodyB; //keeping track to correctly provide recoil on jump
            if (m.standingOn.alive !== true) enter();
        } else if (pair.bodyB === jumpSensor) {
            m.standingOn = pair.bodyA; //keeping track to correctly provide recoil on jump
            if (m.standingOn.alive !== true) enter();
        }
    }
    m.numTouching = 0;
}
/** @param {Matter.IEventCollision<Matter.Engine>} event */
function playerOffGroundCheck(event) {
    //runs on collisions events
    const pairs = event.pairs;
    let jumpSensorIndex = pairs.findIndex(e => e.bodyA == jumpSensor || e.bodyB == jumpSensor)
    if(jumpSensorIndex == -1) return;  
    if (m.onGround && m.numTouching === 0) {
        m.onGround = false;
        m.lastOnGroundCycle = m.cycle;
        m.hardLandCD = 0 // disable hard landing
        if (m.checkHeadClear()) {
            if (m.crouch) m.undoCrouch();
            m.yOffGoal = m.yOffWhen.jump;
        }
    }
}
/** @param {Matter.IEventCollision<Matter.Engine>} event */
function collisionChecks(event) {
    const pairs = event.pairs;
    for (let i = 0, j = pairs.length; i != j; i++) {
        //mob + (player,bullet,body) collisions
        let pair = pairs[i]
        let collidingMob;
        if(pair.bodyA.alive && mob.includes(pair.bodyA)){
            collidingMob = pair.bodyA
            collideMob(pair.bodyB);}
        else if(pair.bodyB.alive && mob.includes(pair.bodyB)){
            collidingMob = pair.bodyB
            collideMob(pair.bodyA);}
        break;
        function collideMob(obj) {
        //player + mob collision
            if (
                (obj === playerBody || obj === playerHead) && 
                m.immuneCycle < m.cycle &&
                !collidingMob.isSlowed && !collidingMob.isStunned
            ) {
                let dmg = Math.min(Math.max(0.025 * Math.sqrt(collidingMob.mass), 0.05), 0.3) * simulation.dmgScale; //player damage is capped at 0.3*dmgScale of 1.0
                collidingMob.foundPlayer();
                if (tech.isRewindAvoidDeath && m.energy > 0.85 * Math.min(1, m.maxEnergy) && dmg > 0.01) { //CPT reversal runs in m.damage, but it stops the rest of the collision code here too
                    m.damage(dmg);
                    return
                }
                m.damage(dmg); //normal damage
                
                if (tech.isCollisionRealitySwitch && m.alive) {
                    m.switchWorlds()
                    simulation.trails()
                    simulation.makeTextLog(`simulation.amplitude <span class='color-symbol'>=</span> ${Math.random()}`);
                }
                if (tech.isPiezo) m.energy += 20.48;
                if (tech.isCouplingNoHit && m.coupling > 0) {
                    m.couplingChange(-4)
                    if(!cache.couplingNoHitDraw) {
                        cache.couplingNoHitDraw = [
                        { x: null, y: null, radius: 22, color: "#00abee54", time: 8 },
                        { x: null, y: null, radius: 18, color: "#00abee80", time: 16},
                        { x: null, y: null, radius: 14, color: "#00abee99", time: 24},
                        { x: null, y: null, radius: 10, color: "#00abeeb3", time: 32}]
                    }
                    const unit = Vector.rotate({ x: 1, y: 0 }, 6.28 * Math.random())
                    let drawList = simulation.drawList;
                    drawList.push({...cache.couplingNoHitDraw[0], ...Vector.add(m.pos, Vector.mult(unit, 17))});
                    drawList.push({...cache.couplingNoHitDraw[1], ...Vector.add(m.pos, Vector.mult(unit, 60))});
                    drawList.push({...cache.couplingNoHitDraw[2], ...Vector.add(m.pos, Vector.mult(unit, 100))});
                    drawList.push({...cache.couplingNoHitDraw[3], ...Vector.add(m.pos, Vector.mult(unit, 135))});
                }
                if (tech.isHarpoonDefense) { //fire harpoons at mobs after getting hit
                    const maxCount = 10 + 3 * tech.extraHarpoons //scale the number of hooks fired
                    let count = maxCount - 1
                    const angle = Math.atan2(collidingMob.position.y - player.position.y, collidingMob.position.x - player.position.x);
                    b.harpoon(m.pos, collidingMob, angle, 0.75, true, 7) // harpoon(where, target, angle = m.angle, harpoonSize = 1, isReturn = false, totalCycles = 35, isReturnAmmo = true, thrust = 0.1) {
                        bullet[bullet.length - 1].drain = 0
                        for (; count > 0; count--) {
                            b.harpoon(m.pos, collidingMob, angle + count * 2 * Math.PI / maxCount, 0.75, true, 7)
                            bullet[bullet.length - 1].drain = 0
                        }
                    }
                    if (tech.isStimulatedEmission) powerUps.ejectTech()
                    if (collidingMob.onHit) collidingMob.onHit();
                    if (m.immuneCycle < m.cycle + m.collisionImmuneCycles) m.immuneCycle = m.cycle + m.collisionImmuneCycles; //player is immune to damage for 30 cycles
                    //extra kick between player and mob              //this section would be better with forces but they don't work...
                    let angle = Math.atan2(player.position.y - collidingMob.position.y, player.position.x - collidingMob.position.x);
                    Matter.Body.setVelocity(player, {
                        x: player.velocity.x + 8 * Math.cos(angle),
                    y: player.velocity.y + 8 * Math.sin(angle)
                });
                Matter.Body.setVelocity(collidingMob, {
                    x: collidingMob.velocity.x - 8 * Math.cos(angle),
                    y: collidingMob.velocity.y - 8 * Math.sin(angle)
                });
                
                if (tech.isAnnihilation && !collidingMob.shield && !collidingMob.isShielded && !collidingMob.isBoss && collidingMob.isDropPowerUp && m.energy > 0.1 && collidingMob.damageReduction > 0) {
                    m.energy -= 0.1 //* Math.max(m.maxEnergy, m.energy) //0.33 * m.energy
                    if (m.immuneCycle === m.cycle + m.collisionImmuneCycles) m.immuneCycle = 0; //player doesn't go immune to collision damage
                    collidingMob.death();
                    simulation.drawList.push({ //add dmg to draw queue
                        x: pair.activeContacts[0].vertex.x,
                        y: pair.activeContacts[0].vertex.y,
                        radius: Math.sqrt(dmg) * 500,
                        color: "rgba(255,0,255,0.2)",
                        time: simulation.drawTime
                    });
                } else {
                    simulation.drawList.push({ //add dmg to draw queue
                        x: pair.activeContacts[0].vertex.x,
                        y: pair.activeContacts[0].vertex.y,
                        radius: Math.sqrt(dmg) * 200,
                        color: simulation.mobDmgColor,
                        time: simulation.drawTime
                    });
                }
            } else {
                //mob + bullet collisions
                if (obj.classType === "bullet" && obj.speed > obj.minDmgSpeed) {
                    obj.beforeDmg(collidingMob); //some bullets do actions when they hits things, like despawn //forces don't seem to work here
                    let dmg = m.dmgScale * (obj.dmg + 0.15 * obj.mass * Vector.magnitude(Vector.sub(collidingMob.velocity, obj.velocity)))
                    if (tech.isCrit && collidingMob.isStunned) dmg *= 4
                    // console.log(dmg) //remove this //thelegendary1248:well now i don't wanna
                    collidingMob.damage(dmg);
                    if (collidingMob.alive) collidingMob.foundPlayer();
                    if (collidingMob.damageReduction) {
                        simulation.drawList.push({ //add dmg to draw queue
                            x: pair.activeContacts[0].vertex.x,
                            y: pair.activeContacts[0].vertex.y,
                            radius: Math.log(dmg + 1.1) * 40 * collidingMob.damageReduction + 3,
                            color: simulation.playerDmgColor,
                            time: simulation.drawTime
                        });
                    }
                    if (tech.isLessDamageReduction && !collidingMob.shield) collidingMob.damageReduction *= collidingMob.isBoss ? (collidingMob.isFinalBoss ? 1.0005 : 1.0025) : 1.05
                    return;
                }
                //mob + body collisions
                if (obj.classType === "body" && obj.speed > 6) {
                    const v = Vector.magnitude(Vector.sub(collidingMob.velocity, obj.velocity));
                    if (v > 9) {
                        if (tech.blockDmg) { //electricity
                            Matter.Body.setVelocity(collidingMob, { x: 0.5 * collidingMob.velocity.x, y: 0.5 * collidingMob.velocity.y });
                            if (tech.isBlockRadiation && !collidingMob.isShielded && !collidingMob.isMobBullet) {
                                mobs.statusDoT(collidingMob, tech.blockDmg * 0.42, 180) //200% increase -> x (1+2) //over 7s -> 360/30 = 12 half seconds -> 3/12
                            } else {
                                collidingMob.damage(tech.blockDmg * m.dmgScale)
                                simulation.drawList.push({
                                    x: pair.activeContacts[0].vertex.x,
                                    y: pair.activeContacts[0].vertex.y,
                                    radius: 28 * collidingMob.damageReduction + 3,
                                    color: "rgba(255,0,255,0.8)",
                                    time: 4
                                });
                            }
                        }
                        
                        let dmg = tech.blockDamage * m.dmgScale * v * obj.mass * (tech.isMobBlockFling ? 2.5 : 1) * (tech.isBlockRestitution ? 2.5 : 1) * ((m.fieldMode === 0 || m.fieldMode === 8) ? 1 + 0.05 * m.coupling : 1);
                        if (collidingMob.isShielded) dmg *= 0.7
                        
                        collidingMob.damage(dmg, true);
                        if (tech.isBlockPowerUps && !collidingMob.alive && collidingMob.isDropPowerUp && m.throwCycle > m.cycle) {
                            options = ["coupling", "boost", "heal", "research"]
                            if (!tech.isEnergyNoAmmo) options.push("ammo")
                            powerUps.spawn(collidingMob.position.x, collidingMob.position.y, options[Math.floor(Math.random() * options.length)]);
                    }
                    
                    const stunTime = dmg / Math.sqrt(obj.mass)
                        if (stunTime > 0.5 && collidingMob.memory !== Infinity) mobs.statusStun(collidingMob, 60 + 60 * Math.sqrt(stunTime))
                        if (collidingMob.alive && collidingMob.distanceToPlayer2() < 1000000 && !m.isCloak) collidingMob.foundPlayer();
                        if (tech.fragments && obj.speed > 10 && !obj.hasFragmented) {
                            obj.hasFragmented = true;
                            b.targetedNail(obj.position, tech.fragments * 4)
                        }
                        if (collidingMob.damageReduction) {
                            let vert = pair.activeContacts[0].vertex
                            simulation.drawList.push({
                                x: vert.x,
                                y: vert.y,
                                radius: Math.log(dmg + 1.1) * 40 * collidingMob.damageReduction + 3,
                                color: simulation.playerDmgColor,
                                time: simulation.drawTime
                            });
                        }
                        return;
                    }
                }
            }
        }
    }
}
/** @param {Matter.IEventCollision<Matter.Engine>} event */
function powerUpMerge(event)
{
    const pairs = event.pairs;
    for (let i = 0, j = pairs.length; i != j; i++) {
        let pair = event.pairs[i]
        let bodyA = pair.bodyA, bodyB = pair.bodyB;
        if (bodyA.collisionFilter.category == cat.powerUp && bodyB.collisionFilter.category == cat.powerUp) {
            const mergeables = ["heal", "coupling", "research", "boost", "ammo"]
            //Can merge, is same type, and not duplicated(come back to this)
            if(mergeables.includes(bodyA.name) && (bodyA.name == bodyB.name) && !bodyA.isDuplicated && !bodyB.isDuplicated)
            {
                //Either of these two powerups aren't in the array anymore, probably from merging
                if(!powerUp.includes(bodyA) || !powerUp.includes(bodyB))
                    continue;
                bodyA.cram++
                bodyB.cram++
                //Merge if powerup has been crammed for long enough
                if(bodyA.cram + bodyB.cram < 1248)
                    continue;
                let powerUpIndex = powerUp.indexOf(bodyB)
                if (powerUpIndex != -1)
                    powerUps.fullRemove(powerUpIndex)
                bodyA.cram = (bodyA.cram + bodyB.cram) - 1248
                let prevCt = bodyA.internalCount
                bodyA.internalCount += bodyB.internalCount
                let scaleBy = Math.sqrt(bodyA.internalCount / prevCt)
                bodyA.size *= scaleBy
                Body.scale(bodyA, scaleBy, scaleBy)
            }
            continue;
        }
    }
}
//we can optimize this
//determine if player is on the ground
Events.on(engine, "collisionStart", function (event) {
    playerOnGroundCheck(event);
    // playerHeadCheck(event);
    collisionChecks(event);
});
Events.on(engine, "collisionActive", function (event) {
    playerOnGroundCheck(event);
    powerUpMerge(event)
    // playerHeadCheck(event);
});
Events.on(engine, "collisionEnd", function (event) {
    playerOffGroundCheck(event);
});