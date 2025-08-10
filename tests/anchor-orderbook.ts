import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorOrderbook } from "../target/types/anchor_orderbook";
import { expect, assert } from "chai";

import {
  createMint,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";

describe("anchor-orderbook", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.anchorOrderbook as Program<AnchorOrderbook>;

  const alex: anchor.web3.Keypair = anchor.web3.Keypair.generate();
  const bob: anchor.web3.Keypair = anchor.web3.Keypair.generate();
  const cranker = anchor.web3.Keypair.generate();

  let alexSeed: number = 1;
  let bobSeed: number = 1;

  let mint_authority: anchor.web3.Keypair = anchor.web3.Keypair.generate();

  let alexAta: any;
  let bobAta: any;

  let alexOrderPda: anchor.web3.PublicKey;
  let bobOrderPda: anchor.web3.PublicKey;

  let alexListedTokenMint: anchor.web3.PublicKey;
  let bobListedTokenMint: anchor.web3.PublicKey;


  before(async () => {
    const provider = anchor.getProvider();
    const connection = provider.connection;

    const latestBlockHash = await connection.getLatestBlockhash();

    let payload = {
      signature: await connection.requestAirdrop(alex.publicKey, 1000000000),
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight
    };
    await connection.confirmTransaction(
      payload,
      "confirmed"
    );
    payload = {
      signature: await connection.requestAirdrop(bob.publicKey, 1000000000),
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight
    };
    await connection.confirmTransaction(
      payload,
      "confirmed"
    );

    payload = {
      signature: await connection.requestAirdrop(mint_authority.publicKey, 1000000000),
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight
    };

    await connection.confirmTransaction(
      payload,
      "confirmed"
    );

    payload = {
      signature: await connection.requestAirdrop(cranker.publicKey, 1000000000),
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight
    };

    await connection.confirmTransaction(
      payload,
      "confirmed"
    );

    // initialize mints
    alexListedTokenMint = await createMint(
      connection,
      mint_authority,
      mint_authority.publicKey,
      null,
      6
    );

    bobListedTokenMint = await createMint(
      connection,
      mint_authority,
      mint_authority.publicKey,
      null,
      6
    );

    // create associated token accounts
    alexAta = await getOrCreateAssociatedTokenAccount(
      connection,
      alex,
      alexListedTokenMint,
      alex.publicKey
    );

    bobAta = await getOrCreateAssociatedTokenAccount(
      connection,
      bob,
      bobListedTokenMint,
      bob.publicKey
    );

    await mintTo(
      connection,
      mint_authority,
      alexListedTokenMint,
      alexAta.address,
      mint_authority.publicKey,
      100_000 * 10 ** 6
    );

    await mintTo(
      connection,
      mint_authority,
      bobListedTokenMint,
      bobAta.address,
      mint_authority.publicKey,
      500_00 * 10 ** 6
    );

    alexOrderPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        alex.publicKey.toBuffer(),
        alexListedTokenMint.toBuffer(),
        Buffer.from([alexSeed])
      ],
      program.programId
    )[0];

    bobOrderPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        bob.publicKey.toBuffer(),
        bobListedTokenMint.toBuffer(),
        Buffer.from([bobSeed])
      ],
      program.programId
    )[0];
  });

  it("Places a sell order successfully", async () => {
    const listedTokenAmount = new anchor.BN(100 * 10 ** 6); // 100 tokens
    const listedTokenPrice = new anchor.BN(2 * 10 ** 6);    // 2 tokens price per unit

    // Get initial balance
    const initialBalance = (await program.provider.connection.getTokenAccountBalance(alexAta.address)).value.amount;

    const tx = await program.methods.placeOrder(
      alexSeed,
      listedTokenAmount,
      listedTokenPrice,
      { sell: {} }
    ).accountsPartial({
      creator: alex.publicKey,
      order: alexOrderPda,
      listedTokenMint: alexListedTokenMint,
      acceptingTokenMint: bobListedTokenMint,
      creatorListedTokenAta: alexAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([alex]).rpc();

    const orderAccount = await program.account.order.fetch(alexOrderPda);

    assert.equal(orderAccount.creator.toString(), alex.publicKey.toString());
    assert.equal(orderAccount.listedTokenMint.toString(), alexListedTokenMint.toString());
    assert.equal(orderAccount.acceptingTokenMint.toString(), bobListedTokenMint.toString());
    assert.equal(orderAccount.listedTokenAmount.toString(), listedTokenAmount.toString());
    assert.equal(orderAccount.listedTokenPrice.toString(), listedTokenPrice.toString());
    assert.equal(orderAccount.filledAmount.toString(), "0");
    assert.deepEqual(orderAccount.orderType, { sell: {} });
    assert.deepEqual(orderAccount.orderStatus, { open: {} });
    assert.equal(orderAccount.seed, alexSeed);

    const vaultAddress = await getAssociatedTokenAddress(alexListedTokenMint, alexOrderPda, true);
    const vaultBalance = (await program.provider.connection.getTokenAccountBalance(vaultAddress)).value.amount;
    assert.equal(vaultBalance, listedTokenAmount.toString());

    const finalBalance = (await program.provider.connection.getTokenAccountBalance(alexAta.address)).value.amount;
    assert.equal(parseInt(finalBalance), parseInt(initialBalance) - listedTokenAmount.toNumber());
  });

  it("Places a buy order successfully", async () => {
    const listedTokenAmount = new anchor.BN(50 * 10 ** 6); // 50 tokens
    const listedTokenPrice = new anchor.BN(2 * 10 ** 6);   // 3 tokens price per unit

    // Get initial balance
    const initialBalance = (await program.provider.connection.getTokenAccountBalance(bobAta.address)).value.amount;

    const tx = await program.methods.placeOrder(
      bobSeed,
      listedTokenAmount,
      listedTokenPrice,
      { buy: {} }
    ).accountsPartial({
      creator: bob.publicKey,
      order: bobOrderPda,
      listedTokenMint: bobListedTokenMint, // Bob is offering bobListedTokenMint tokens
      acceptingTokenMint: alexListedTokenMint, // Bob wants alexListedTokenMint tokens
      creatorListedTokenAta: bobAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([bob]).rpc();

    // Verify the order account was created
    const orderAccount = await program.account.order.fetch(bobOrderPda);

    // Verify order details
    assert.equal(orderAccount.creator.toString(), bob.publicKey.toString());
    assert.equal(orderAccount.listedTokenMint.toString(), bobListedTokenMint.toString());
    assert.equal(orderAccount.acceptingTokenMint.toString(), alexListedTokenMint.toString());
    assert.equal(orderAccount.listedTokenAmount.toString(), listedTokenAmount.toString());
    assert.equal(orderAccount.listedTokenPrice.toString(), listedTokenPrice.toString());
    assert.equal(orderAccount.filledAmount.toString(), "0");
    assert.deepEqual(orderAccount.orderType, { buy: {} });
    assert.deepEqual(orderAccount.orderStatus, { open: {} });
    assert.equal(orderAccount.seed, bobSeed);

    // Verify tokens were transferred to vault
    const vaultAddress = await getAssociatedTokenAddress(bobListedTokenMint, bobOrderPda, true);
    const vaultBalance = (await program.provider.connection.getTokenAccountBalance(vaultAddress)).value.amount;
    assert.equal(vaultBalance, listedTokenAmount.toString());

    // Verify tokens were deducted from creator's account
    const finalBalance = (await program.provider.connection.getTokenAccountBalance(bobAta.address)).value.amount;
    assert.equal(parseInt(finalBalance), parseInt(initialBalance) - listedTokenAmount.toNumber());
  });

  it("Places multiple orders with different seeds", async () => {
    const newSeed = 2;
    const listedTokenAmount = new anchor.BN(25 * 10 ** 6);
    const listedTokenPrice = new anchor.BN(1 * 10 ** 6);

    // Create new order PDA with different seed
    const newOrderPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        alex.publicKey.toBuffer(),
        alexListedTokenMint.toBuffer(),
        Buffer.from([newSeed])
      ],
      program.programId
    )[0];

    const tx = await program.methods.placeOrder(
      newSeed,
      listedTokenAmount,
      listedTokenPrice,
      { sell: {} }
    ).accountsPartial({
      creator: alex.publicKey,
      order: newOrderPda,
      listedTokenMint: alexListedTokenMint,
      acceptingTokenMint: bobListedTokenMint,
      creatorListedTokenAta: alexAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([alex]).rpc();

    // Verify the new order account was created
    const orderAccount = await program.account.order.fetch(newOrderPda);
    assert.equal(orderAccount.seed, newSeed);
    assert.equal(orderAccount.listedTokenAmount.toString(), listedTokenAmount.toString());
  });

  it("Fails to place order with zero amount", async () => {
    const newSeed = 3;
    const newOrderPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        alex.publicKey.toBuffer(),
        alexListedTokenMint.toBuffer(),
        Buffer.from([newSeed])
      ],
      program.programId
    )[0];

    try {
      await program.methods.placeOrder(
        newSeed,
        new anchor.BN(0), // Zero amount
        new anchor.BN(1 * 10 ** 6),
        { sell: {} }
      ).accountsPartial({
        creator: alex.publicKey,
        order: newOrderPda,
        listedTokenMint: alexListedTokenMint,
        acceptingTokenMint: bobListedTokenMint,
        creatorListedTokenAta: alexAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([alex]).rpc();

      // Should not reach here
      assert.fail("Expected transaction to fail");
    } catch (error) {
      assert.exists(error);
    }
  });

  it("Resolves matching buy and sell orders", async () => {
    let connection = anchor.getProvider().connection;
    const alexNewSeed = 10;
    const alexSellAmount = new anchor.BN(50 * 10 ** 6); // 50 tokens
    const alexSellPrice = new anchor.BN(2 * 10 ** 6);   // 2 bobListedTokenMint per alexListedTokenMint

    const alexSellOrderPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        alex.publicKey.toBuffer(),
        alexListedTokenMint.toBuffer(),
        Buffer.from([alexNewSeed])
      ],
      program.programId
    )[0];

    // Place Alex's sell order
    await program.methods.placeOrder(
      alexNewSeed,
      alexSellAmount,
      alexSellPrice,
      { sell: {} }
    ).accountsPartial({
      creator: alex.publicKey,
      order: alexSellOrderPda,
      listedTokenMint: alexListedTokenMint,
      acceptingTokenMint: bobListedTokenMint,
      creatorListedTokenAta: alexAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([alex]).rpc();

    const bobNewSeed = 10;
    const bobBuyAmount = new anchor.BN(100 * 10 ** 6); // 100 bobListedTokenMint tokens to pay
    const bobBuyPrice = new anchor.BN(2 * 10 ** 6);    // 2 bobListedTokenMint per alexListedTokenMint (same price)

    const bobBuyOrderPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        bob.publicKey.toBuffer(),
        bobListedTokenMint.toBuffer(),
        Buffer.from([bobNewSeed])
      ],
      program.programId
    )[0];

    // Place Bob's buy order
    await program.methods.placeOrder(
      bobNewSeed,
      bobBuyAmount,
      bobBuyPrice,
      { buy: {} }
    ).accountsPartial({
      creator: bob.publicKey,
      order: bobBuyOrderPda,
      listedTokenMint: bobListedTokenMint,
      acceptingTokenMint: alexListedTokenMint,
      creatorListedTokenAta: bobAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([bob]).rpc();

    const alexbobListedTokenMintAta = await getOrCreateAssociatedTokenAccount(
      connection,
      alex,
      bobListedTokenMint,
      alex.publicKey
    );

    const bobalexListedTokenMintAta = await getOrCreateAssociatedTokenAccount(
      connection,
      bob,
      alexListedTokenMint,
      bob.publicKey
    );

    const alexInitialbobListedTokenMint = (await connection.getTokenAccountBalance(alexbobListedTokenMintAta.address)).value.amount;
    const bobInitialalexListedTokenMint = (await connection.getTokenAccountBalance(bobalexListedTokenMintAta.address)).value.amount;

    const alexSellVault = await getAssociatedTokenAddress(alexListedTokenMint, alexSellOrderPda, true);
    const bobBuyVault = await getAssociatedTokenAddress(bobListedTokenMint, bobBuyOrderPda, true);

    const matchAmount = new anchor.BN(25 * 10 ** 6);

    const tx = await program.methods.resolveOrder(
      bob.publicKey,      // buyer
      alex.publicKey,     // seller
      matchAmount         // amount to trade
    ).accountsPartial({
      cranker: cranker.publicKey,
      sellerMint: alexListedTokenMint,
      buyerMint: bobListedTokenMint,
      buyOrder: bobBuyOrderPda,
      sellOrder: alexSellOrderPda,
      buyOrderVault: bobBuyVault,
      sellOrderVault: alexSellVault,
      buyerAta: bobalexListedTokenMintAta.address,
      sellerAta: alexbobListedTokenMintAta.address,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([cranker]).rpc();


    const updatedAlexOrder = await program.account.order.fetch(alexSellOrderPda);
    const updatedBobOrder = await program.account.order.fetch(bobBuyOrderPda);

    assert.equal(updatedAlexOrder.filledAmount.toString(), matchAmount.toString());
    assert.deepEqual(updatedAlexOrder.orderStatus, { partiallyFilled: {} });

    assert.equal(updatedBobOrder.filledAmount.toString(), matchAmount.toString());
    assert.deepEqual(updatedBobOrder.orderStatus, { partiallyFilled: {} });

    const alexFinalalexListedTokenMint = (await connection.getTokenAccountBalance(alexAta.address)).value.amount;
    const alexFinalbobListedTokenMint = (await connection.getTokenAccountBalance(alexbobListedTokenMintAta.address)).value.amount;
    const bobFinalalexListedTokenMint = (await connection.getTokenAccountBalance(bobalexListedTokenMintAta.address)).value.amount;
    const bobFinalbobListedTokenMint = (await connection.getTokenAccountBalance(bobAta.address)).value.amount;


    const expectedbobListedTokenMintForAlex = matchAmount.toNumber() * alexSellPrice.toNumber() / (10 ** 6);
    assert.equal(
      parseInt(alexFinalbobListedTokenMint),
      parseInt(alexInitialbobListedTokenMint) + expectedbobListedTokenMintForAlex
    );

    assert.equal(
      parseInt(bobFinalalexListedTokenMint),
      parseInt(bobInitialalexListedTokenMint) + matchAmount.toNumber()
    );


    const alexVaultFinal = (await connection.getTokenAccountBalance(alexSellVault)).value.amount;
    const bobVaultFinal = (await connection.getTokenAccountBalance(bobBuyVault)).value.amount;

    assert.equal(
      parseInt(alexVaultFinal),
      alexSellAmount.toNumber() - matchAmount.toNumber()
    );
    assert.equal(
      parseInt(bobVaultFinal),
      bobBuyAmount.toNumber() - expectedbobListedTokenMintForAlex
    );
  });

  it("cancel an order!", async () => {
    let connection = anchor.getProvider().connection;

    const cancelSeed = 20;
    const cancelAmount = new anchor.BN(30 * 10 ** 6);
    const cancelPrice = new anchor.BN(3 * 10 ** 6);

    const cancelOrderPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        alex.publicKey.toBuffer(),
        alexListedTokenMint.toBuffer(),
        Buffer.from([cancelSeed])
      ],
      program.programId
    )[0];

    const alexInitialBalance = (await connection.getTokenAccountBalance(alexAta.address)).value.amount;

    await program.methods.placeOrder(
      cancelSeed,
      cancelAmount,
      cancelPrice,
      { sell: {} }
    ).accountsPartial({
      creator: alex.publicKey,
      order: cancelOrderPda,
      listedTokenMint: alexListedTokenMint,
      acceptingTokenMint: bobListedTokenMint,
      creatorListedTokenAta: alexAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([alex]).rpc();

    const createdOrder = await program.account.order.fetch(cancelOrderPda);

    const balanceAfterPlace = (await connection.getTokenAccountBalance(alexAta.address)).value.amount;
    assert.equal(
      parseInt(balanceAfterPlace),
      parseInt(alexInitialBalance) - cancelAmount.toNumber()
    );

    const vaultAddress = await getAssociatedTokenAddress(alexListedTokenMint, cancelOrderPda, true);
    const vaultBalance = (await connection.getTokenAccountBalance(vaultAddress)).value.amount;
    assert.equal(parseInt(vaultBalance), cancelAmount.toNumber());


    const cancelTx = await program.methods.closeOrder()
      .accountsPartial({
        creator: alex.publicKey,
        order: cancelOrderPda,
        listedTokenMint: alexListedTokenMint,
        acceptingTokenMint: bobListedTokenMint,
        creatorListedTokenAta: alexAta.address,
        vault: vaultAddress,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([alex])
      .rpc();


    try {
      await program.account.order.fetch(cancelOrderPda);
      assert.fail("Order account should have been closed");
    } catch (error) {
    }

    const finalBalance = (await connection.getTokenAccountBalance(alexAta.address)).value.amount;
    assert.equal(parseInt(finalBalance), parseInt(alexInitialBalance));

    try {
      const finalVaultBalance = await connection.getTokenAccountBalance(vaultAddress);
      assert.equal(parseInt(finalVaultBalance.value.amount), 0);
    } catch (error) {
    }
  });

  it("fails to cancel order from wrong creator", async () => {
    const wrongCancelSeed = 21;
    const wrongCancelAmount = new anchor.BN(10 * 10 ** 6);
    const wrongCancelPrice = new anchor.BN(2 * 10 ** 6);

    const wrongCancelOrderPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        alex.publicKey.toBuffer(),
        alexListedTokenMint.toBuffer(),
        Buffer.from([wrongCancelSeed])
      ],
      program.programId
    )[0];

    await program.methods.placeOrder(
      wrongCancelSeed,
      wrongCancelAmount,
      wrongCancelPrice,
      { sell: {} }
    ).accountsPartial({
      creator: alex.publicKey,
      order: wrongCancelOrderPda,
      listedTokenMint: alexListedTokenMint,
      acceptingTokenMint: bobListedTokenMint,
      creatorListedTokenAta: alexAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([alex]).rpc();

    let connection = anchor.getProvider().connection;
    const bobalexListedTokenMintAta = await getOrCreateAssociatedTokenAccount(
      connection,
      bob,
      alexListedTokenMint,
      bob.publicKey
    );

    const vaultAddress = await getAssociatedTokenAddress(alexListedTokenMint, wrongCancelOrderPda, true);

    try {
      await program.methods.closeOrder()
        .accountsPartial({
          creator: bob.publicKey,
          order: wrongCancelOrderPda,
          listedTokenMint: alexListedTokenMint,
          acceptingTokenMint: bobListedTokenMint,
          creatorListedTokenAta: bobalexListedTokenMintAta.address,
          vault: vaultAddress,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        })
        .signers([bob])
        .rpc();

      assert.fail("Should have failed with wrong creator");
    } catch (error) {
      assert.exists(error);
    }

    await program.methods.closeOrder()
      .accountsPartial({
        creator: alex.publicKey,
        order: wrongCancelOrderPda,
        listedTokenMint: alexListedTokenMint,
        acceptingTokenMint: bobListedTokenMint,
        creatorListedTokenAta: alexAta.address,
        vault: vaultAddress,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([alex])
      .rpc();
  });
});