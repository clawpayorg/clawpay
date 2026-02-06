use anchor_lang::prelude::*;

// ClawPay Agent Registry - Deployed on Devnet
declare_id!("AB95WrrNSUFwxHwa2PnvCDQJwP3nVtGvC7dCHPj2PY5z");

#[program]
pub mod clawpay_registry {
    use super::*;

    /// Register a new agent in the ClawPay network
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        name: String,
        symbol: String,
        description: String,
        image_uri: String,
    ) -> Result<()> {
        require!(name.len() <= 64, RegistryError::NameTooLong);
        require!(symbol.len() <= 16, RegistryError::SymbolTooLong);
        require!(description.len() <= 256, RegistryError::DescriptionTooLong);
        require!(image_uri.len() <= 256, RegistryError::UriTooLong);

        let agent = &mut ctx.accounts.agent;
        agent.token_mint = ctx.accounts.token_mint.key();
        agent.creator = ctx.accounts.creator.key();
        agent.name = name;
        agent.symbol = symbol;
        agent.description = description;
        agent.image_uri = image_uri;
        agent.registered_at = Clock::get()?.unix_timestamp;
        agent.bump = ctx.bumps.agent;

        msg!("Agent registered: {} ({})", agent.name, agent.symbol);
        msg!("Token mint: {}", agent.token_mint);
        msg!("Creator: {}", agent.creator);

        Ok(())
    }

    /// Update agent metadata (only by creator)
    pub fn update_agent(
        ctx: Context<UpdateAgent>,
        name: Option<String>,
        description: Option<String>,
        image_uri: Option<String>,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;

        if let Some(new_name) = name {
            require!(new_name.len() <= 64, RegistryError::NameTooLong);
            agent.name = new_name;
        }

        if let Some(new_description) = description {
            require!(new_description.len() <= 256, RegistryError::DescriptionTooLong);
            agent.description = new_description;
        }

        if let Some(new_uri) = image_uri {
            require!(new_uri.len() <= 256, RegistryError::UriTooLong);
            agent.image_uri = new_uri;
        }

        msg!("Agent updated: {}", agent.name);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + AgentAccount::INIT_SPACE,
        seeds = [b"agent", token_mint.key().as_ref()],
        bump
    )]
    pub agent: Account<'info, AgentAccount>,

    /// The token mint that this agent represents
    /// CHECK: We just store the pubkey, no need to deserialize
    pub token_mint: AccountInfo<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    #[account(
        mut,
        seeds = [b"agent", agent.token_mint.as_ref()],
        bump = agent.bump,
        has_one = creator @ RegistryError::Unauthorized
    )]
    pub agent: Account<'info, AgentAccount>,

    pub creator: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct AgentAccount {
    pub token_mint: Pubkey,     // 32
    pub creator: Pubkey,         // 32
    #[max_len(64)]
    pub name: String,            // 4 + 64
    #[max_len(16)]
    pub symbol: String,          // 4 + 16
    #[max_len(256)]
    pub description: String,     // 4 + 256
    #[max_len(256)]
    pub image_uri: String,       // 4 + 256
    pub registered_at: i64,      // 8
    pub bump: u8,                // 1
}

#[error_code]
pub enum RegistryError {
    #[msg("Agent name is too long (max 64 characters)")]
    NameTooLong,
    #[msg("Symbol is too long (max 16 characters)")]
    SymbolTooLong,
    #[msg("Description is too long (max 256 characters)")]
    DescriptionTooLong,
    #[msg("Image URI is too long (max 256 characters)")]
    UriTooLong,
    #[msg("Only the creator can update this agent")]
    Unauthorized,
}
