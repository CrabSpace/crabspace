use anchor_lang::prelude::*;

declare_id!("5Zw1g6oMwzcWMU1qhfSXQdMtxbxbJ6CawMm5RDuQ7Z8P");

#[program]
pub mod crabspace_id {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, head_hash: [u8; 32]) -> Result<()> {
        let identity = &mut ctx.accounts.identity;
        identity.owner = ctx.accounts.creator.key();
        identity.creator = ctx.accounts.creator.key();
        identity.latest_hash = head_hash;
        identity.proposed_successor = None;
        identity.bump = ctx.bumps.identity;
        
        msg!("Identity anchored for creator: {:?}", identity.creator);
        Ok(())
    }

    pub fn propose_successor(ctx: Context<UpdateIdentity>, successor: Pubkey) -> Result<()> {
        let identity = &mut ctx.accounts.identity;
        identity.proposed_successor = Some(successor);
        msg!("Successor proposed: {:?}", successor);
        Ok(())
    }

    pub fn claim_identity(ctx: Context<ClaimIdentity>) -> Result<()> {
        let identity = &mut ctx.accounts.identity;
        
        // Logical check: is the claimant the proposed successor?
        if let Some(proposed) = identity.proposed_successor {
            if proposed == ctx.accounts.claimant.key() {
                identity.owner = proposed;
                identity.proposed_successor = None;
                msg!("Identity claimed by successor: {:?}", identity.owner);
                return Ok(());
            }
        }
        
        Err(error!(ErrorCode::UnauthorizedClaim))
    }

    pub fn log_work(ctx: Context<LogWork>, new_hash: [u8; 32]) -> Result<()> {
        let identity = &mut ctx.accounts.identity;
        identity.latest_hash = new_hash;
        msg!("Work anchored. New latest hash: {:?}", new_hash);
        Ok(())
    }

    /// Reset identity ownership back to the original creator.
    /// Safety net for lost successor keys. Only the creator can call this.
    pub fn reset_identity(ctx: Context<ResetIdentity>) -> Result<()> {
        let identity = &mut ctx.accounts.identity;
        identity.owner = identity.creator;
        identity.proposed_successor = None;
        msg!("Identity reset to creator: {:?}", identity.creator);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ResetIdentity<'info> {
    #[account(
        mut,
        seeds = [b"isnad", identity.creator.as_ref()],
        bump = identity.bump,
        constraint = identity.creator == creator.key() @ ErrorCode::UnauthorizedReset
    )]
    pub identity: Account<'info, IsnadIdentity>,
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct LogWork<'info> {
    #[account(
        mut,
        seeds = [b"isnad", identity.creator.as_ref()],
        bump = identity.bump,
        has_one = owner @ ErrorCode::UnauthorizedUpdate
    )]
    pub identity: Account<'info, IsnadIdentity>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 32 + 32 + 33 + 1, // disc + owner + creator + hash + proposed + bump
        seeds = [b"isnad", creator.key().as_ref()],
        bump
    )]
    pub identity: Account<'info, IsnadIdentity>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateIdentity<'info> {
    #[account(
        mut,
        seeds = [b"isnad", identity.creator.as_ref()],
        bump = identity.bump,
        has_one = owner @ ErrorCode::UnauthorizedUpdate
    )]
    pub identity: Account<'info, IsnadIdentity>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimIdentity<'info> {
    #[account(
        mut,
        seeds = [b"isnad", identity.creator.as_ref()],
        bump = identity.bump,
    )]
    pub identity: Account<'info, IsnadIdentity>,
    #[account(mut)]
    pub claimant: Signer<'info>,
}

#[account]
pub struct IsnadIdentity {
    pub owner: Pubkey,             // Current authorized agent
    pub creator: Pubkey,           // Lineage root (fixed seed)
    pub latest_hash: [u8; 32],     // Current head of the Work Journal
    pub proposed_successor: Option<Pubkey>, // The agent in line to inherit
    pub bump: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("You are not the authorized owner of this identity.")]
    UnauthorizedUpdate,
    #[msg("You are not the proposed successor for this identity.")]
    UnauthorizedClaim,
    #[msg("Only the original creator can reset identity ownership.")]
    UnauthorizedReset,
}
